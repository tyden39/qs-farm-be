import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { Gateway, GatewayStatus } from './entities/gateway.entity';
import { Device } from 'src/device/entities/device.entity';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { PairGatewayDto } from './dto/pair-gateway.dto';
import { AssignDevicesDto } from './dto/assign-devices.dto';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    @InjectRepository(Gateway)
    private readonly gatewayRepository: Repository<Gateway>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly mqttService: MqttService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Called when gateway publishes to provision/gateway/new
   * Creates/updates Gateway(PENDING) and sends pairingToken back
   */
  @OnEvent('gateway.provision.requested')
  async handleProvisionRequest(payload: {
    serial: string;
    hw?: string;
    nonce: string;
  }) {
    try {
      const { serial, hw, nonce } = payload;
      this.logger.log(`Gateway provision request: serial=${serial} nonce=${nonce}`);

      let gateway = await this.gatewayRepository.findOne({ where: { serial } });

      if (!gateway) {
        gateway = this.gatewayRepository.create({
          serial,
          hardwareVersion: hw,
          status: GatewayStatus.PENDING,
        });
      }

      const pairingToken = randomBytes(32).toString('hex');
      gateway.nonce = nonce;
      gateway.pairingToken = pairingToken;
      gateway.pairingTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      gateway.pairingTokenUsed = false;
      gateway.provisionedAt = new Date();

      await this.gatewayRepository.save(gateway);

      await this.mqttService.publishToTopic(`provision/gateway/resp/${nonce}`, {
        pairingToken,
      });

      this.logger.log(`Gateway provisioned: serial=${serial} id=${gateway.id}`);
    } catch (error) {
      this.logger.error('Gateway provision error:', error);
    }
  }

  /**
   * App pairs gateway with a farm using pairingToken
   */
  async pairGateway(dto: PairGatewayDto): Promise<{ gatewayId: string; mqttToken: string }> {
    const gateway = await this.gatewayRepository.findOne({
      where: { pairingToken: dto.pairingToken },
    });

    if (!gateway) {
      throw new NotFoundException('Invalid pairing token');
    }

    if (gateway.pairingTokenUsed) {
      throw new BadRequestException('Pairing token already used');
    }

    if (gateway.pairingTokenExpiresAt && gateway.pairingTokenExpiresAt < new Date()) {
      throw new BadRequestException('Pairing token expired');
    }

    const mqttToken = randomBytes(32).toString('hex');

    gateway.farmId = dto.farmId;
    gateway.status = GatewayStatus.PAIRED;
    gateway.mqttToken = mqttToken;
    gateway.pairingTokenUsed = true;
    gateway.pairedAt = new Date();

    await this.gatewayRepository.save(gateway);

    // Publish credentials back to gateway using stored nonce
    await this.mqttService.publishToTopic(`provision/gateway/resp/${gateway.nonce}`, {
      gatewayId: gateway.id,
      mqttToken,
    });

    this.logger.log(`Gateway paired: id=${gateway.id} farmId=${dto.farmId}`);
    return { gatewayId: gateway.id, mqttToken };
  }

  async findByFarm(farmId: string): Promise<Gateway[]> {
    return this.gatewayRepository.find({ where: { farmId } });
  }

  async findOne(id: string): Promise<Gateway> {
    const gateway = await this.gatewayRepository.findOne({ where: { id } });
    if (!gateway) {
      throw new NotFoundException(`Gateway ${id} not found`);
    }
    return gateway;
  }

  /**
   * Handle gateway heartbeat and LWT from MQTT
   */
  @OnEvent('gateway.status.received')
  async handleGatewayStatus(data: { gatewayId: string; payload: any }) {
    const { gatewayId, payload } = data;

    if (payload.type === 'heartbeat') {
      await this.gatewayRepository.update(gatewayId, {
        lastSeenAt: new Date(),
        ...(payload.fw ? { firmwareVersion: payload.fw } : {}),
      });
      return;
    }

    if (payload.reason === 'lwt') {
      this.logger.warn(`Gateway disconnected (LWT): ${gatewayId}`);
      await this.gatewayRepository.update(gatewayId, { lastSeenAt: null });
    }
  }

  async assignDevices(gatewayId: string, dto: AssignDevicesDto): Promise<{ assigned: number }> {
    const gateway = await this.findOne(gatewayId);

    const devices = await this.deviceRepository.find({
      where: { id: In(dto.deviceIds), farmId: gateway.farmId },
    });

    if (devices.length === 0) {
      throw new BadRequestException('No valid devices found in same farm');
    }

    await this.deviceRepository.update(
      { id: In(devices.map((d) => d.id)) },
      { gatewayId },
    );

    this.eventEmitter.emit('gateway.devices.changed', { gatewayId });
    return { assigned: devices.length };
  }

  async unassignDevices(gatewayId: string, dto: AssignDevicesDto): Promise<{ unassigned: number }> {
    const result = await this.deviceRepository.update(
      { id: In(dto.deviceIds), gatewayId },
      { gatewayId: null },
    );

    this.eventEmitter.emit('gateway.devices.changed', { gatewayId });
    return { unassigned: result.affected || 0 };
  }

  async findDevicesByGateway(gatewayId: string): Promise<Device[]> {
    return this.deviceRepository.find({ where: { gatewayId } });
  }

  isGatewayOnline(gateway: Gateway): boolean {
    if (!gateway.lastSeenAt) return false;
    return (Date.now() - gateway.lastSeenAt.getTime()) < 90_000;
  }

  @OnEvent('gateway.devices.reported')
  async handleDevicesReported(data: { gatewayId: string; payload: { devices: string[] } }) {
    const { gatewayId, payload } = data;
    const serials = payload.devices;

    if (!Array.isArray(serials) || serials.length === 0) return;

    try {
      const gateway = await this.gatewayRepository.findOne({ where: { id: gatewayId } });
      if (!gateway?.farmId) {
        this.logger.warn(`Gateway ${gatewayId} not paired to farm, ignoring device report`);
        return;
      }

      const devices = await this.deviceRepository.find({
        where: { serial: In(serials), farmId: gateway.farmId },
      });

      const toAssign = devices.filter((d) => !d.gatewayId || d.gatewayId === gatewayId);
      const skipped = devices.filter((d) => d.gatewayId && d.gatewayId !== gatewayId);

      if (skipped.length > 0) {
        this.logger.warn(
          `Gateway ${gatewayId}: ${skipped.length} devices already assigned to other gateways`,
        );
      }

      const newAssign = toAssign.filter((d) => d.gatewayId !== gatewayId);
      if (newAssign.length === 0) return;

      await this.deviceRepository.update(
        { id: In(newAssign.map((d) => d.id)) },
        { gatewayId },
      );

      this.eventEmitter.emit('gateway.devices.changed', { gatewayId });
      this.logger.log(
        `Gateway ${gatewayId}: auto-assigned ${newAssign.length} devices [${newAssign.map((d) => d.serial).join(', ')}]`,
      );
    } catch (error) {
      this.logger.error(`Gateway device report error: ${error.message}`);
    }
  }
}
