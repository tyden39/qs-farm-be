import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Device, DeviceStatus } from 'src/device/entities/device.entity';
import { Farm } from 'src/farm/entities/farm.entity';
import { EmqxAuthDto } from './dto/emqx-auth.dto';
import { EmqxAclDto } from './dto/emqx-acl.dto';

@Injectable()
export class EmqxService {
  private readonly logger = new Logger(EmqxService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authenticate MQTT client connection
   * Device connects with token as password
   * User connects with JWT as password
   */
  async authenticate(body: EmqxAuthDto): Promise<boolean> {
    try {
      const { username, password } = body;

      // Case 1: Device authentication with deviceToken
      // username format: device:{deviceId} or serial
      if (username.startsWith('device:') || username.length === 36) {
        const device = await this.deviceRepository.findOne({
          where: [{ id: username }, { serial: username }],
        } as any);

        if (!device || !device.deviceToken) {
          this.logger.warn(`Device auth failed for ${username}`);
          return false;
        }

        // Simple token comparison for static tokens
        const tokenMatches = device.deviceToken === password;
        if (tokenMatches && device.status !== DeviceStatus.DISABLED) {
          this.logger.log(`Device authenticated: ${username}`);
          return true;
        }

        return false;
      }

      // Case 2: User authentication with JWT
      try {
        const payload = this.jwtService.verify(password, {
          secret: process.env.JWT_ACCESS_SECRET,
        });

        if (payload && payload.id === username) {
          this.logger.log(`User authenticated: ${username}`);
          return true;
        }

        return false;
      } catch (error) {
        this.logger.debug(`JWT verification failed for ${username}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Check ACL permissions for pub/sub
   * access: 1 = subscribe, 2 = publish
   */
  async checkAcl(body: EmqxAclDto): Promise<boolean> {
    try {
      const { username, topic, access } = body;

      // Device access control
      if (username.startsWith('device:')) {
        return this.checkDeviceAcl(username, topic, access);
      }

      // User access control (via JWT username = userId)
      return this.checkUserAcl(username, topic, access);
    } catch (error) {
      this.logger.error('ACL check error:', error);
      return false;
    }
  }

  /**
   * Check device topic permissions
   * Device can publish/subscribe to:
   * - device/{deviceId}/#
   */
  private async checkDeviceAcl(
    deviceId: string,
    topic: string,
    access: number,
  ): Promise<boolean> {
    const cleanDeviceId = deviceId.replace('device:', '');
    const device = await this.deviceRepository.findOne(cleanDeviceId as any);

    if (!device || device.status === DeviceStatus.DISABLED) {
      return false;
    }

    // Allow device to access its own topics
    if (topic === `device/${cleanDeviceId}/status`) return true;
    if (topic === `device/${cleanDeviceId}/telemetry`) return true;
    if (topic === `device/${cleanDeviceId}/cmd`) return true;
    if (topic === `device/${cleanDeviceId}/resp`) return true;
    if (topic.startsWith(`device/${cleanDeviceId}/`)) return true;

    // Deny provisioning topics for paired devices
    if (device.status !== DeviceStatus.PENDING) {
      if (topic === 'provision/new' || topic.startsWith('provision/')) {
        return false;
      }
    }

    return false;
  }

  /**
   * Check user topic permissions
   * User can only access devices in their farms
   */
  private async checkUserAcl(
    userId: string,
    topic: string,
    access: number,
  ): Promise<boolean> {
    // User notifications
    if (topic === `user/${userId}/notifications`) {
      return true;
    }

    // Parse topic to extract deviceId
    const topicParts = topic.split('/');

    // device/{deviceId}/# pattern
    if (topicParts[0] === 'device' && topicParts.length >= 2) {
      const deviceId = topicParts[1];

      // Find device and verify user owns the farm
      const device = await this.deviceRepository.findOne(deviceId as any, {
        relations: ['farm'],
      });

      if (device && device.farm && device.farm.userId === userId) {
        // Allow pub/sub for device commands, responses, status, telemetry
        if (
          topic.includes('cmd') ||
          topic.includes('resp') ||
          topic.includes('status') ||
          topic.includes('telemetry')
        ) {
          return true;
        }
      }

      return false;
    }

    return false;
  }
}
