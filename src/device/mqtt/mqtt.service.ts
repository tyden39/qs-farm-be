import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

  constructor(private readonly eventEmitter: EventEmitter2) {}

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
    this.client.subscribe('device/+/resp', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to device/+/resp', err);
      } else {
        this.logger.log('Subscribed to device/+/resp');
      }
    });

    // Gateway provisioning
    this.client.subscribe('provision/gateway/new', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to provision/gateway/new', err);
      } else {
        this.logger.log('Subscribed to provision/gateway/new');
      }
    });

    // Gateway status (heartbeat + LWT)
    this.client.subscribe('gateway/+/status', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to gateway/+/status', err);
      } else {
        this.logger.log('Subscribed to gateway/+/status');
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

      // this.logger.debug(`Received MQTT message from ${deviceId}:`, payload);

      // Emit gateway events directly via EventEmitter
      if (topic === 'provision/gateway/new') {
        this.eventEmitter.emit('gateway.provision.requested', payload);
        return;
      }

      if (topic.startsWith('gateway/') && topic.endsWith('/status')) {
        const gatewayId = topic.split('/')[1];
        this.eventEmitter.emit('gateway.status.received', { gatewayId, payload, timestamp: new Date() });
        return;
      }

      // Collect matching callbacks (exact match + wildcard pattern match + global '*')
      const matchedCallbacks: Function[] = [];

      for (const [pattern, callbacks] of this.messageCallbacks.entries()) {
        if (pattern === '*' || this.topicMatchesPattern(topic, pattern)) {
          matchedCallbacks.push(...callbacks);
        }
      }

      matchedCallbacks.forEach((callback) => {
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

  /**
   * Check if an MQTT topic matches a subscription pattern
   * Supports '+' (single-level) and '#' (multi-level) wildcards
   */
  private topicMatchesPattern(topic: string, pattern: string): boolean {
    if (topic === pattern) return true;

    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (i >= topicParts.length || patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    return topicParts.length === patternParts.length;
  }

  private extractDeviceId(topic: string): string {
    // Extract device ID from topic format: device/{deviceId}/...
    const parts = topic.split('/');

    if (parts[0] === 'device') {
      return parts[1] || 'unknown';
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
   * Publish command to device via MQTT.
   * If gatewayId is provided (LoRa mode), publishes to scoped topic:
   *   gateway/{gatewayId}/device/{deviceId}/cmd
   * Otherwise (WiFi direct), publishes to:
   *   device/{deviceId}/cmd
   */
  async publishToDevice(deviceId: string, command: string, data: any, gatewayId?: string | null, serial?: string | null) {
    const topic = gatewayId
      ? `gateway/${gatewayId}/device/${deviceId}/cmd`
      : `device/${deviceId}/cmd`;
    const payload: Record<string, any> = {
      command,
      data,
      timestamp: new Date().toISOString(),
    };

    // Include device serial so gateway can identify the target LoRa device
    if (gatewayId && serial) {
      payload.serial = serial;
    }

    return this.publishToTopic(topic, payload);
  }

  async disconnect() {
    if (this.client) {
      await this.client.endAsync();
      this.logger.log('Disconnected from MQTT broker');
    }
  }
}
