import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Device, DeviceStatus } from 'src/device/entities/device.entity';
import { PairingToken } from 'src/device/entities/pairing-token.entity';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { ProvisionRequestDto } from './dto/provision-request.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

@Injectable()
export class ProvisionService {
  private readonly logger = new Logger(ProvisionService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(PairingToken)
    private readonly pairingTokenRepository: Repository<PairingToken>,
    private readonly mqttService: MqttService,
  ) {}

  /**
   * Handle device provisioning request
   * Device publishes to provision/new with serial and hardware version
   */
  async handleProvisionRequest(payload: ProvisionRequestDto) {
    try {
      const { serial, hw } = payload;

      this.logger.log(`Provisioning request from serial: ${serial}, hw: ${hw}`);

      // Validate serial format
      if (!serial || serial.length === 0) {
        this.logger.warn('Provisioning failed: Invalid serial');
        return null;
      }

      // Validate hardware version if provided
      if (hw && !this.isValidHardwareVersion(hw)) {
        this.logger.warn(`Invalid hardware version: ${hw}`);
        return null;
      }

      // Check if device already exists
      let device = await this.deviceRepository.findOne({
        where: { serial },
      });

      // If device exists and is already paired, reject
      if (device && device.status === DeviceStatus.ACTIVE) {
        this.logger.warn(`Device already paired: ${serial}`);
        return null;
      }

      // Create or update device in PENDING status
      if (!device) {
        device = this.deviceRepository.create({
          serial,
          hardwareVersion: hw || null,
          status: DeviceStatus.PENDING,
          name: `Device-${serial.slice(-8)}`,
          imei: serial, // Use serial as imei for now
          farmId: null, // Will be set during pairing
          provisionedAt: new Date(),
        });
      } else {
        device.hardwareVersion = hw || device.hardwareVersion;
        device.status = DeviceStatus.PENDING;
        device.provisionedAt = new Date();
      }

      device = await this.deviceRepository.save(device);

      // Generate pairing token
      const pairingToken = await this.generatePairingToken(serial);

      this.logger.log(`Device provisioned: ${serial} (${device.id})`);

      // Publish provision response via MQTT
      await this.publishProvisionResponse(device.id, pairingToken.token);

      return {
        deviceId: device.id,
        serial: device.serial,
        pairingToken: pairingToken.token,
        expiresAt: pairingToken.expiresAt,
      };
    } catch (error) {
      this.logger.error('Provision request error:', error);
      return null;
    }
  }

  /**
   * Pair device to farm (called from mobile app)
   */
  async pairDevice(userId: string, dto: PairDeviceDto) {
    try {
      const { serial, farmId, pairingToken } = dto;

      this.logger.log(`Pairing device: ${serial} to farm: ${farmId} for user: ${userId}`);

      // Find device by serial (no relations – avoid duplicate farmId assignment)
      const device = await this.deviceRepository.findOne({
        where: { serial },
      });

      if (!device) {
        throw new NotFoundException(`Device not found: ${serial}`);
      }

      // Check if device is in provisioning state
      if (device.status !== DeviceStatus.PENDING && device.status !== DeviceStatus.PAIRED) {
        throw new BadRequestException(
          `Device cannot be paired. Status: ${device.status}`,
        );
      }

      // Verify pairing token (REQUIRED)
      const pairingTokenRecord = await this.pairingTokenRepository.findOne({
        where: { serial },
      });

      if (!pairingTokenRecord) {
        throw new BadRequestException(
          `No pairing token found for device: ${serial}. Device may not be provisioned yet.`,
        );
      }

      // Check if token already used
      if (pairingTokenRecord.used) {
        throw new BadRequestException(
          `Pairing token for device ${serial} has already been used.`,
        );
      }

      // Check if token expired
      if (new Date() > pairingTokenRecord.expiresAt) {
        throw new BadRequestException(
          `Pairing token for device ${serial} has expired. Please re-provision the device.`,
        );
      }

      // Verify pairing token matches (REQUIRED)
      if (pairingTokenRecord.token !== pairingToken) {
        throw new BadRequestException(
          `Invalid pairing token for device: ${serial}`,
        );
      }

      // Verify farm belongs to user
      // TODO: Add farm ownership verification

      // Generate device token for MQTT authentication
      const deviceToken = this.generateDeviceToken();

      // Update device – only set farmId (not farm relation) to avoid "multiple assignments" error
      await this.deviceRepository.update(device.id, {
        farmId,
        deviceToken,
        status: DeviceStatus.PAIRED,
        pairedAt: new Date(),
      });

      // Mark pairing token as used
      await this.pairingTokenRepository.update(
        pairingTokenRecord.id,
        { used: true },
      );

      this.logger.log(`Device paired: ${serial} (${device.id})`);

      // Send set_owner command to device via MQTT
      await this.publishSetOwnerCommand(device.id, userId, deviceToken, farmId);

      return {
        deviceId: device.id,
        serial: device.serial,
        deviceToken,
        status: DeviceStatus.PAIRED,
      };
    } catch (error) {
      this.logger.error('Pair device error:', error);
      throw error;
    }
  }

  /**
   * Unpair device
   */
  async unpairDevice(deviceId: string) {
    const device = await this.deviceRepository.findOne(deviceId as any);

    if (!device) {
      throw new NotFoundException(`Device not found: ${deviceId}`);
    }

    device.farmId = null;
    device.deviceToken = null;
    device.status = DeviceStatus.PENDING;

    await this.deviceRepository.save(device);

    this.logger.log(`Device unpaired: ${deviceId}`);

    return device;
  }

  /**
   * Regenerate device token
   */
  async regenerateDeviceToken(deviceId: string) {
    const device = await this.deviceRepository.findOne(deviceId as any);

    if (!device) {
      throw new NotFoundException(`Device not found: ${deviceId}`);
    }

    if (device.status !== DeviceStatus.PAIRED && device.status !== DeviceStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot regenerate token for device in ${device.status} status`,
      );
    }

    const newToken = this.generateDeviceToken();
    device.deviceToken = newToken;

    await this.deviceRepository.save(device);

    this.logger.log(`Token regenerated for device: ${deviceId}`);

    return {
      deviceId,
      deviceToken: newToken,
    };
  }

  /**
   * Get pairing status for a device
   */
  async getPairingStatus(serial: string) {
    const device = await this.deviceRepository.findOne({
      where: { serial },
      relations: ['farm'],
    });

    if (!device) {
      throw new NotFoundException(`Device not found: ${serial}`);
    }

    return {
      deviceId: device.id,
      serial: device.serial,
      status: device.status,
      farmId: device.farmId || null,
      provisionedAt: device.provisionedAt,
      pairedAt: device.pairedAt,
    };
  }

  // Private helper methods

  private async generatePairingToken(serial: string): Promise<PairingToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const pairingToken = this.pairingTokenRepository.create({
      token,
      serial,
      expiresAt,
      used: false,
    });

    return this.pairingTokenRepository.save(pairingToken);
  }

  private generateDeviceToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private isValidHardwareVersion(hw: string): boolean {
    // Basic validation - can be customized
    return hw.length > 0 && hw.length <= 50;
  }

  private async publishProvisionResponse(deviceId: string, token: string) {
    try {
      await this.mqttService.publishToTopic(
        `device/${deviceId}/provision/resp`,
        {
          status: 'provisioned',
          token,
          message: 'Device provisioned. Ready for pairing.',
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.debug(`Published provision response for ${deviceId}`);
    } catch (error) {
      this.logger.warn(`Failed to publish provision response: ${error.message}`);
    }
  }

  private async publishSetOwnerCommand(
    deviceId: string,
    userId: string,
    deviceToken: string,
    farmId: string,
  ) {
    try {
      await this.mqttService.publishToTopic(
        `farm/${farmId}/device/${deviceId}/cmd`,
        {
          cmd: 'set_owner',
          ownerId: userId,
          token: deviceToken,
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.debug(`Published set_owner command for device ${deviceId}`);
    } catch (error) {
      this.logger.warn(`Failed to publish set_owner command: ${error.message}`);
    }
  }
}
