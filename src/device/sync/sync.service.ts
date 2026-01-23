import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MqttService, MqttMessage } from '../mqtt/mqtt.service';
import { DeviceGateway } from '../websocket/device.gateway';
import { ProvisionService } from 'src/provision/provision.service';

/**
 * Sync Service - Bridge between MQTT (devices) and WebSocket (mobile apps)
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
    private readonly provisionService: ProvisionService,
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
      this.handleDeviceStatus(message);
    });

    // Listen to device telemetry
    this.mqttService.onMessage('device/+/telemetry', (message: MqttMessage) => {
      this.handleDeviceTelemetry(message);
    });

    // Listen to device responses
    this.mqttService.onMessage('farm/+/device/+/resp', (message: MqttMessage) => {
      this.handleDeviceResponse(message);
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
        
        // Broadcast to mobile clients
        this.deviceGateway.broadcast('deviceProvisioned', {
          deviceId: result.deviceId,
          serial: payload.serial,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('Provisioning error:', error);
    }
  }

  /**
   * Handle incoming device status update
   */
  private handleDeviceStatus(message: MqttMessage) {
    const { deviceId, topic, payload, timestamp } = message;

    this.logger.debug(`Processing device status from ${deviceId}`);

    this.deviceGateway.broadcastDeviceStatus(deviceId, {
      ...payload,
      receivedAt: timestamp,
    });
  }

  /**
   * Handle incoming device telemetry
   */
  private handleDeviceTelemetry(message: MqttMessage) {
    const { deviceId, topic, payload, timestamp } = message;

    this.logger.debug(`Processing telemetry from ${deviceId}`);

    this.deviceGateway.broadcastDeviceData(deviceId, {
      type: 'telemetry',
      ...payload,
      receivedAt: timestamp,
    });
  }

  /**
   * Handle device response to command
   */
  private handleDeviceResponse(message: MqttMessage) {
    const { deviceId, topic, payload, timestamp } = message;

    this.logger.debug(`Processing response from ${deviceId}`);

    this.deviceGateway.broadcastDeviceStatus(deviceId, {
      type: 'commandResponse',
      ...payload,
      receivedAt: timestamp,
    });
  }

  /**
   * Send command from mobile app to device via MQTT
   */
  async sendCommandToDevice(deviceId: string, command: string, params: any) {
    this.logger.log(`Sending command to device ${deviceId}: ${command}`);

    try {
      await this.mqttService.publishToDevice(deviceId, command, params);

      // Notify mobile app that command was sent
      this.deviceGateway.broadcastDeviceStatus(deviceId, {
        type: 'commandSent',
        command,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Command sent to device',
      };
    } catch (error) {
      this.logger.error(`Failed to send command to device ${deviceId}:`, error);

      // Notify mobile app of error
      this.deviceGateway.broadcastDeviceStatus(deviceId, {
        type: 'commandFailed',
        command,
        error: error.message,
        timestamp: new Date().toISOString(),
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
