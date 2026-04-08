import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { Device, DeviceStatus } from 'src/device/entities/device.entity';
import { Farm } from 'src/farm/entities/farm.entity';
import { Gateway, GatewayStatus } from 'src/gateway/entities/gateway.entity';
import { UserService } from 'src/user/user.service';
import { EmqxAuthDto } from './dto/emqx-auth.dto';
import { EmqxAclDto } from './dto/emqx-acl.dto';

@Injectable()
export class EmqxService {
  private readonly logger = new Logger(EmqxService.name);

  // In-memory cache: gwId → { deviceIds, expiresAt }
  private gatewayDeviceCache = new Map<string, { deviceIds: Set<string>; expiresAt: number }>();
  private readonly CACHE_TTL = 60_000; // 60s

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,
    @InjectRepository(Gateway)
    private readonly gatewayRepository: Repository<Gateway>,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
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

      // Case 1.5: Gateway authentication — username format: gateway:{gatewayId}
      if (username.startsWith('gateway:')) {
        const gwId = username.replace('gateway:', '');
        const gateway = await this.gatewayRepository.findOne({ where: { id: gwId } });

        if (!gateway?.mqttToken || gateway.status === GatewayStatus.DISABLED) {
          this.logger.warn(`Gateway auth failed: ${gwId}`);
          return false;
        }

        const ok = gateway.mqttToken === password;
        if (ok) this.logger.log(`Gateway authenticated: ${gwId}`);
        return ok;
      }

      // Case 2: User authentication with JWT
      try {
        const payload = this.jwtService.verify(password, {
          secret: process.env.JWT_ACCESS_SECRET,
        });

        if (payload && payload.id === username) {
          const user = await this.userService.findOne(payload.id);

          if (user.tokenVersion !== payload.tokenVersion) {
            this.logger.warn(`Token revoked for user ${username}`);
            return false;
          }

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

      // Gateway access control
      if (username.startsWith('gateway:')) {
        return await this.checkGatewayAcl(username, topic, access);
      }

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

  private async checkGatewayAcl(username: string, topic: string, access: number): Promise<boolean> {
    const gwId = username.replace('gateway:', '');

    // PUBLISH
    if (access === 2) {
      if (topic === `gateway/${gwId}/status`) return true;
      if (topic === 'provision/gateway/new') return true;

      // Device topics — gateway must own the device
      if (topic.startsWith('device/')) {
        const deviceId = topic.split('/')[1];
        const deviceIds = await this.getGatewayDeviceIds(gwId);
        if (!deviceIds.has(deviceId)) {
          this.logger.warn(`Gateway ${gwId} denied publish to ${topic}: device not assigned`);
          return false;
        }
        return true;
      }

      return false;
    }

    // SUBSCRIBE
    if (access === 1) {
      if (topic === `gateway/${gwId}/ota`) return true;
      if (topic === `gateway/${gwId}/device-ota`) return true;
      if (topic.startsWith('provision/gateway/resp/')) return true;

      // Device topics — allow wildcard only for command topic, validate ownership otherwise
      if (topic.startsWith('device/')) {
        const parts = topic.split('/');
        const deviceId = parts[1];
        // Gateway subscribes device/+/cmd to receive commands for all its devices
        if (deviceId === '+' && parts[2] === 'cmd') return true;
        if (deviceId === '+') return false;
        const deviceIds = await this.getGatewayDeviceIds(gwId);
        return deviceIds.has(deviceId);
      }

      return false;
    }

    return false;
  }

  private async getGatewayDeviceIds(gatewayId: string): Promise<Set<string>> {
    const cached = this.gatewayDeviceCache.get(gatewayId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.deviceIds;
    }

    const devices = await this.deviceRepository.find({
      where: { gatewayId },
      select: ['id'],
    });

    const deviceIds = new Set(devices.map((d) => d.id));
    this.gatewayDeviceCache.set(gatewayId, {
      deviceIds,
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    return deviceIds;
  }

  @OnEvent('gateway.devices.changed')
  handleGatewayDevicesChanged(data: { gatewayId: string }) {
    this.gatewayDeviceCache.delete(data.gatewayId);
    this.logger.debug(`ACL cache invalidated for gateway ${data.gatewayId}`);
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
