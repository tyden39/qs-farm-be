import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttService, MqttMessage } from '../mqtt/mqtt.service';
import { DeviceGateway } from '../websocket/device.gateway';
import { ProvisionService } from 'src/provision/provision.service';
import { Device } from '../entities/device.entity';

/**
 * Sync Service - Bridge between MQTT (devices) and WebSocket (mobile apps)
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  // deviceId → { farmId, zoneId } cache (60s TTL)
  private deviceContextCache: Map<
    string,
    { farmId: string | null; zoneId: string | null; loadedAt: number }
  > = new Map();
  private readonly FARM_CACHE_TTL = 60_000;

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
    private readonly provisionService: ProvisionService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  onModuleInit() {
    this.setupMqttToWebSocketSync();
    this.logger.log('Sync Service initialized');
  }

  /**
   * Forward MQTT messages from devices to WebSocket clients (mobile apps)
   */
  private setupMqttToWebSocketSync() {
    // Listen to provisioning messages
    this.mqttService.onMessage('provision/new', (message: MqttMessage) => {
      this.handleProvisioningMessage(message);
    });

    // Listen to device status messages
    this.mqttService.onMessage('device/+/status', (message: MqttMessage) => {
      this.handleDeviceStatus(message).catch((err) =>
        this.logger.error(
          `Error handling status from ${message.deviceId}:`,
          err,
        ),
      );
    });

    // Listen to device telemetry
    this.mqttService.onMessage('device/+/telemetry', (message: MqttMessage) => {
      this.handleDeviceTelemetry(message).catch((err) =>
        this.logger.error(
          `Error handling telemetry from ${message.deviceId}:`,
          err,
        ),
      );
    });

    // Listen to device responses
    this.mqttService.onMessage('device/+/resp', (message: MqttMessage) => {
      this.handleDeviceResponse(message).catch((err) =>
        this.logger.error(
          `Error handling response from ${message.deviceId}:`,
          err,
        ),
      );
    });

    this.logger.log('MQTT to WebSocket sync enabled');
  }

  /**
   * Handle provisioning request from device
   */
  private async handleProvisioningMessage(message: MqttMessage) {
    const { payload } = message;

    this.logger.log('Processing provisioning request:', payload);

    try {
      const result = await this.provisionService.handleProvisionRequest({
        serial: payload.serial,
        hw: payload.hw,
        nonce: payload.nonce,
        sig: payload.sig,
      });

      if (result) {
        this.logger.log(`Device provisioned: ${payload.serial}`);
      }
    } catch (error) {
      this.logger.error('Provisioning error:', error);
    }
  }

  private async getDeviceIds(deviceId: string): Promise<{ farmId: string | null; zoneId: string | null }> {
    const cached = this.deviceContextCache.get(deviceId);
    if (cached && Date.now() - cached.loadedAt < this.FARM_CACHE_TTL) {
      return { farmId: cached.farmId, zoneId: cached.zoneId };
    }
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    const entry = {
      farmId: device?.farmId ?? null,
      zoneId: device?.zoneId ?? null,
      loadedAt: Date.now(),
    };
    this.deviceContextCache.set(deviceId, entry);
    return { farmId: entry.farmId, zoneId: entry.zoneId };
  }

  /**
   * Handle incoming device status update
   */
  private async handleDeviceStatus(message: MqttMessage) {
    const { deviceId, payload, timestamp } = message;

    this.logger.debug(`Processing device status from ${deviceId}`);

    const { farmId } = await this.getDeviceIds(deviceId);

    this.deviceGateway.broadcastDeviceStatus(
      deviceId,
      {
        ...payload,
        receivedAt: timestamp,
      },
      farmId,
    );

    // LWT disconnect detection
    if (payload.reason === 'lwt') {
      this.eventEmitter.emit('pump.disconnected', {
        deviceId,
        farmId,
        timestamp,
      });
    }
  }

  /**
   * Handle incoming device telemetry
   */
  private async handleDeviceTelemetry(message: MqttMessage) {
    const { deviceId, payload, timestamp } = message;

    this.logger.debug(`Processing telemetry from ${deviceId}`);

    const { farmId, zoneId } = await this.getDeviceIds(deviceId);

    this.deviceGateway.broadcastDeviceData(
      deviceId,
      {
        type: 'telemetry',
        ...payload,
        receivedAt: timestamp,
      },
      farmId,
    );

    this.eventEmitter.emit('telemetry.received', {
      deviceId,
      payload,
      timestamp,
      farmId,
      zoneId,
    });

    // Pump status events
    if (payload.pumpStatus !== undefined) {
      if (payload.pumpStatus === 1) {
        this.eventEmitter.emit('pump.started', {
          deviceId,
          farmId,
          timestamp,
          irrigationMode: payload.mode || undefined,
          controlMode: payload.controlMode || undefined,
        });
      } else if (payload.pumpStatus === 0) {
        this.eventEmitter.emit('pump.stopped', {
          deviceId,
          farmId,
          sessionId: payload.sessionId || null,
          timestamp,
        });
      }
    }
  }

  /**
   * Handle device response to command
   */
  private async handleDeviceResponse(message: MqttMessage) {
    const { deviceId, payload, timestamp } = message;

    this.logger.log(
      `Device response from ${deviceId}: command=${payload.command} success=${payload.success}`,
    );

    const { farmId } = await this.getDeviceIds(deviceId);

    this.deviceGateway.broadcastDeviceStatus(
      deviceId,
      {
        type: 'commandResponse',
        ...payload,
        receivedAt: timestamp,
      },
      farmId,
    );

    // Detect firmware OTA_UPDATE response
    if (payload.command === 'OTA_UPDATE') {
      this.logger.log(
        `OTA report via MQTT: device=${deviceId} version=${payload.version} success=${payload.success}`,
      );
      this.eventEmitter.emit('firmware.update.reported', {
        deviceId,
        version: payload.version,
        success: payload.success,
        errorMessage: payload.error,
        duration: payload.duration,
        previousVersion: payload.previousVersion,
        timestamp,
      });
    }
  }

  /**
   * Send command from mobile app to device via MQTT
   */
  async sendCommandToDevice(deviceId: string, command: string, params: any) {
    this.logger.log(`Sending command to device ${deviceId}: ${command}`);

    const { farmId } = await this.getDeviceIds(deviceId);

    try {
      await this.mqttService.publishToDevice(deviceId, command, params);

      // Notify mobile app that command was sent
      this.deviceGateway.broadcastDeviceStatus(
        deviceId,
        {
          type: 'commandSent',
          command,
          timestamp: new Date().toISOString(),
        },
        farmId,
      );

      this.eventEmitter.emit('command.dispatched', {
        deviceId,
        command,
        params,
        success: true,
      });

      return {
        success: true,
        message: 'Command sent to device',
      };
    } catch (error) {
      this.logger.error(`Failed to send command to device ${deviceId}:`, error);

      // Notify mobile app of error
      this.deviceGateway.broadcastDeviceStatus(
        deviceId,
        {
          type: 'commandFailed',
          command,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        farmId,
      );

      this.eventEmitter.emit('command.dispatched', {
        deviceId,
        command,
        params,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * Check if device is online
   */
  async isDeviceOnline(deviceId: string): Promise<boolean> {
    return this.mqttService.isDeviceConnected(deviceId);
  }

  /**
   * Broadcast device list update to all mobile clients
   */
  broadcastDeviceListUpdate() {
    this.deviceGateway.broadcast('deviceListUpdated', {
      timestamp: new Date().toISOString(),
    });
  }
}
