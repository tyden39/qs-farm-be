import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { Gateway, GatewayStatus } from './entities/gateway.entity';
import { Device, DeviceStatus } from 'src/device/entities/device.entity';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { PairGatewayDto } from './dto/pair-gateway.dto';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    @InjectRepository(Gateway)
    private readonly gatewayRepository: Repository<Gateway>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly mqttService: MqttService,
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

    // Bulk assign all active farm devices to this gateway (bidirectional auto-assign)
    const updateResult = await this.deviceRepository.update(
      { farmId: dto.farmId, status: Not(DeviceStatus.DISABLED) },
      { gatewayId: gateway.id },
    );
    this.logger.log(`Gateway ${gateway.id}: auto-assigned ${updateResult.affected ?? 0} farm devices`);

    // Publish credentials back to gateway using stored nonce
    await this.mqttService.publishToTopic(`provision/gateway/resp/${gateway.nonce}`, {
      gatewayId: gateway.id,
      mqttToken,
    });

    this.logger.log(`Gateway paired: id=${gateway.id} farmId=${dto.farmId}`);
    return { gatewayId: gateway.id, mqttToken };
  }

  /**
   * Unpair gateway from farm — nulls gatewayId on all assigned devices
   */
  async deleteGateway(id: string): Promise<void> {
    const gateway = await this.findOne(id);

    // Release all assigned devices before removing gateway
    await this.deviceRepository.update({ gatewayId: id }, { gatewayId: null });
    this.logger.log(`Gateway ${id}: released all assigned devices`);

    await this.gatewayRepository.remove(gateway);
    this.logger.log(`Gateway deleted: ${id}`);
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

  async findDevicesByGateway(gatewayId: string): Promise<Device[]> {
    return this.deviceRepository.find({ where: { gatewayId } });
  }

  isGatewayOnline(gateway: Gateway): boolean {
    if (!gateway.lastSeenAt) return false;
    return (Date.now() - gateway.lastSeenAt.getTime()) < 90_000;
  }

}
