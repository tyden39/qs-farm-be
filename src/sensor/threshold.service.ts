import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';
import { SensorConfig } from './entities/sensor-config.entity';
import { AlertLog, AlertDirection } from './entities/alert-log.entity';
import { CommandLog, CommandSource } from './entities/command-log.entity';
import { ThresholdLevel } from './enums/threshold-level.enum';
import { SENSOR_REASON_MAP } from './constants/threshold-rules';

@Injectable()
export class ThresholdService {
  private readonly logger = new Logger(ThresholdService.name);

  // Anti-spam: state machine
  // Map<deviceId, Map<action, currentState>>
  private deviceStates: Map<string, Map<string, boolean>> = new Map();

  // Anti-spam: cooldown
  // Map<`${deviceId}:${sensorType}`, timestamp>
  private lastActionTime: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 30_000;

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    @InjectRepository(CommandLog)
    private readonly commandLogRepo: Repository<CommandLog>,
  ) {}

  async evaluate(
    deviceId: string,
    config: SensorConfig,
    value: number,
  ) {
    const { sensorType, thresholds } = config;

    // Sort: CRITICAL first, then WARNING
    const sorted = [...thresholds].sort((a, b) => {
      if (a.level === ThresholdLevel.CRITICAL) return -1;
      if (b.level === ThresholdLevel.CRITICAL) return 1;
      return 0;
    });

    for (const threshold of sorted) {
      let direction: AlertDirection | null = null;
      let thresholdValue: number | null = null;

      if (
        threshold.minThreshold !== null &&
        threshold.minThreshold !== undefined &&
        value < threshold.minThreshold
      ) {
        direction = AlertDirection.BELOW;
        thresholdValue = threshold.minThreshold;
      } else if (
        threshold.maxThreshold !== null &&
        threshold.maxThreshold !== undefined &&
        value > threshold.maxThreshold
      ) {
        direction = AlertDirection.ABOVE;
        thresholdValue = threshold.maxThreshold;
      }

      if (direction === null) continue;

      // Anti-spam checks
      if (!this.shouldDispatch(deviceId, sensorType, threshold.action)) {
        this.logger.debug(
          `Anti-spam blocked: ${threshold.action} for ${deviceId}/${sensorType}`,
        );
        return;
      }

      const reasonMap = SENSOR_REASON_MAP[sensorType];
      const reason =
        direction === AlertDirection.BELOW
          ? reasonMap?.belowMin
          : reasonMap?.aboveMax;

      // Dispatch command (skip if ALERT_ONLY)
      if (threshold.action !== 'ALERT_ONLY') {
        try {
          await this.mqttService.publishToDevice(
            deviceId,
            threshold.action,
            {
              reason,
              sensorType,
              level: threshold.level,
              value,
              threshold: thresholdValue,
            },
          );

          this.deviceGateway.broadcastDeviceData(deviceId, {
            type: 'command_dispatched',
            command: threshold.action,
            sensorType,
            level: threshold.level,
            value,
            threshold: thresholdValue,
            reason,
          });

          await this.commandLogRepo.save(
            this.commandLogRepo.create({
              deviceId,
              command: threshold.action,
              params: { reason, sensorType, level: threshold.level, value, threshold: thresholdValue },
              source: CommandSource.AUTOMATED,
              sensorType,
              reason,
              success: true,
            }),
          );
        } catch (error) {
          this.logger.error(
            `Failed to dispatch command ${threshold.action} to ${deviceId}:`,
            error,
          );

          await this.commandLogRepo.save(
            this.commandLogRepo.create({
              deviceId,
              command: threshold.action,
              params: { reason, sensorType, level: threshold.level, value, threshold: thresholdValue },
              source: CommandSource.AUTOMATED,
              sensorType,
              reason,
              success: false,
              errorMessage: error.message,
            }),
          ).catch((e) => this.logger.error('Failed to log command:', e));
        }
      }

      // Log alert
      const alertLog = this.alertLogRepo.create({
        deviceId,
        sensorType,
        value,
        threshold: thresholdValue,
        level: threshold.level,
        direction,
        action: threshold.action,
        reason,
      });
      await this.alertLogRepo.save(alertLog);

      // Broadcast alert to WebSocket
      this.deviceGateway.broadcastDeviceData(deviceId, {
        type: 'alert',
        sensorType,
        value,
        threshold: thresholdValue,
        level: threshold.level,
        direction,
        action: threshold.action,
        reason,
      });

      this.logger.log(
        `Alert: ${sensorType} ${direction} ${thresholdValue} (value=${value}, level=${threshold.level}, action=${threshold.action})`,
      );

      // Stop at first violation (CRITICAL takes priority)
      return;
    }

    // No violation — clear state for this sensor's actions
    this.clearStatesForSensor(deviceId, config);
  }

  private shouldDispatch(
    deviceId: string,
    sensorType: string,
    action: string,
  ): boolean {
    // State machine check
    const deviceStateMap =
      this.deviceStates.get(deviceId) || new Map<string, boolean>();
    const currentState = deviceStateMap.get(action);

    if (currentState === true) {
      return false; // Already in this state
    }

    // Cooldown check
    const cooldownKey = `${deviceId}:${sensorType}`;
    const lastTime = this.lastActionTime.get(cooldownKey);
    if (lastTime && Date.now() - lastTime < this.COOLDOWN_MS) {
      return false;
    }

    // Update state and cooldown
    deviceStateMap.set(action, true);
    this.deviceStates.set(deviceId, deviceStateMap);
    this.lastActionTime.set(cooldownKey, Date.now());

    return true;
  }

  private clearStatesForSensor(deviceId: string, config: SensorConfig) {
    const deviceStateMap = this.deviceStates.get(deviceId);
    if (!deviceStateMap) return;

    for (const threshold of config.thresholds) {
      deviceStateMap.delete(threshold.action);
    }
  }
}
