import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';

export interface MqttMessage {
  deviceId: string;
  topic: string;
  payload: any;
  timestamp: Date;
}

@Injectable()
export class MqttService implements OnModuleInit {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private messageCallbacks: Map<string, Function[]> = new Map();

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const options: mqtt.IClientOptions = {
      clientId: `nest-server-${Math.random().toString(16).substr(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 1000,
    };

    this.logger.log(`Connecting to MQTT broker: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (error) => {
      this.logger.error('MQTT connection error:', error);
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection closed');
    });

    this.client.on('reconnect', () => {
      this.logger.log('Reconnecting to MQTT broker...');
    });
  }

  private subscribeToTopics() {
    // Provisioning topics
    this.client.subscribe('provision/new', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to provision/new', err);
      } else {
        this.logger.log('Subscribed to provision/new');
      }
    });

    // Device status and telemetry
    this.client.subscribe('device/+/status', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to device/+/status', err);
      } else {
        this.logger.log('Subscribed to device/+/status');
      }
    });

    this.client.subscribe('device/+/telemetry', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to device/+/telemetry', err);
      } else {
        this.logger.log('Subscribed to device/+/telemetry');
      }
    });

    // Device responses
    this.client.subscribe('farm/+/device/+/resp', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to farm/+/device/+/resp', err);
      } else {
        this.logger.log('Subscribed to farm/+/device/+/resp');
      }
    });
  }

  private handleMessage(topic: string, message: Buffer) {
    try {
      const payload = JSON.parse(message.toString());
      const deviceId = this.extractDeviceId(topic);

      const mqttMessage: MqttMessage = {
        deviceId,
        topic,
        payload,
        timestamp: new Date(),
      };

      this.logger.debug(`Received MQTT message from ${deviceId}:`, payload);

      // Trigger all registered callbacks for this topic
      const callbacks = this.messageCallbacks.get(topic) || [];
      const wildcardCallbacks = this.messageCallbacks.get('*') || [];

      [...callbacks, ...wildcardCallbacks].forEach((callback) => {
        try {
          callback(mqttMessage);
        } catch (error) {
          this.logger.error('Error in message callback:', error);
        }
      });
    } catch (error) {
      this.logger.error('Error parsing MQTT message:', error);
    }
  }

  private extractDeviceId(topic: string): string {
    // Extract device ID from various topic formats
    // device/{deviceId}/... -> {deviceId}
    // farm/{farmId}/device/{deviceId}/... -> {deviceId}
    const parts = topic.split('/');

    if (parts[0] === 'device') {
      return parts[1] || 'unknown';
    }

    if (parts[0] === 'farm' && parts[2] === 'device') {
      return parts[3] || 'unknown';
    }

    return 'unknown';
  }

  /**
   * Subscribe to MQTT messages
   * @param topic - Topic to subscribe to, or '*' for all messages
   * @param callback - Function to call when message is received
   */
  onMessage(topic: string, callback: (message: MqttMessage) => void) {
    if (!this.messageCallbacks.has(topic)) {
      this.messageCallbacks.set(topic, []);
    }
    this.messageCallbacks.get(topic).push(callback);
  }

  /**
   * Publish message to a specific topic
   */
  async publishToTopic(topic: string, payload: any) {
    return new Promise<void>((resolve, reject) => {
      this.client.publish(
        topic,
        JSON.stringify(payload),
        { qos: 1 },
        (error) => {
          if (error) {
            this.logger.error(`Failed to publish to ${topic}:`, error);
            reject(error);
          } else {
            this.logger.log(`Published to ${topic}`);
            resolve();
          }
        },
      );
    });
  }

  /**
   * Publish message to device via MQTT
   * @param deviceId - Device ID
   * @param command - Command name
   * @param data - Command data
   */
  async publishToDevice(deviceId: string, command: string, data: any) {
    const topic = `device/${deviceId}/command`;
    const payload = {
      command,
      data,
      timestamp: new Date().toISOString(),
    };

    return this.publishToTopic(topic, payload);
  }

  /**
   * Check if device is connected (based on last message time)
   */
  async isDeviceConnected(deviceId: string): Promise<boolean> {
    // This is a simple check - you might want to implement a more sophisticated
    // presence system using MQTT's Last Will and Testament (LWT) feature
    return this.client && this.client.connected;
  }

  async disconnect() {
    if (this.client) {
      await this.client.endAsync();
      this.logger.log('Disconnected from MQTT broker');
    }
  }
}

