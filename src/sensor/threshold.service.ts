import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';
import { SensorConfig } from './entities/sensor-config.entity';
import { SensorThreshold } from './entities/sensor-threshold.entity';
import { AlertLog, AlertDirection } from './entities/alert-log.entity';
import { CommandLog, CommandSource } from './entities/command-log.entity';
import { ThresholdLevel } from './enums/threshold-level.enum';
import { ThresholdType } from './enums/threshold-type.enum';
import { SENSOR_REASON_MAP } from './constants/threshold-rules';

@Injectable()
export class ThresholdService {
  private readonly logger = new Logger(ThresholdService.name);

  // Anti-spam: state machine per threshold identity
  // Map<`${deviceId}:${sensorType}:${level}:${type}`, boolean>
  private thresholdStates: Map<string, boolean> = new Map();

  // Anti-spam: cooldown per threshold identity
  // Map<`${deviceId}:${sensorType}:${level}:${type}`, timestamp>
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

    // Pass 1: Clear states for all non-violated thresholds
    for (const threshold of thresholds) {
      const violated = this.isViolated(value, threshold);
      if (!violated) {
        const stateKey = this.stateKey(deviceId, sensorType, threshold);
        this.thresholdStates.delete(stateKey);
      }
    }

    // Pass 2: Process violations, CRITICAL first
    const sorted = [...thresholds].sort((a, b) => {
      if (a.level === ThresholdLevel.CRITICAL) return -1;
      if (b.level === ThresholdLevel.CRITICAL) return 1;
      return 0;
    });

    for (const threshold of sorted) {
      if (!this.isViolated(value, threshold)) continue;

      const stateKey = this.stateKey(deviceId, sensorType, threshold);
      if (!this.shouldDispatch(stateKey)) {
        this.logger.debug(
          `Anti-spam blocked: ${threshold.action} for ${deviceId}/${sensorType}/${threshold.level}:${threshold.type}`,
        );
        return;
      }

      const reasonMap = SENSOR_REASON_MAP[sensorType];
      const reason =
        threshold.type === ThresholdType.MIN
          ? reasonMap?.belowMin
          : reasonMap?.aboveMax;

      const direction =
        threshold.type === ThresholdType.MIN
          ? AlertDirection.BELOW
          : AlertDirection.ABOVE;

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
              threshold: threshold.threshold,
            },
          );

          this.deviceGateway.broadcastDeviceData(deviceId, {
            type: 'command_dispatched',
            command: threshold.action,
            sensorType,
            level: threshold.level,
            value,
            threshold: threshold.threshold,
            reason,
          });

          await this.commandLogRepo.save(
            this.commandLogRepo.create({
              deviceId,
              command: threshold.action,
              params: { reason, sensorType, level: threshold.level, value, threshold: threshold.threshold },
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
              params: { reason, sensorType, level: threshold.level, value, threshold: threshold.threshold },
              source: CommandSource.AUTOMATED,
              sensorType,
              reason,
              success: false,
              errorMessage: error.message,
            }),
          ).catch((e) => this.logger.error('Failed to log command:', e));
        }
      }

      const alertLog = this.alertLogRepo.create({
        deviceId,
        sensorType,
        value,
        threshold: threshold.threshold,
        level: threshold.level,
        direction,
        action: threshold.action,
        reason,
      });
      await this.alertLogRepo.save(alertLog);

      this.deviceGateway.broadcastDeviceData(deviceId, {
        type: 'alert',
        sensorType,
        value,
        threshold: threshold.threshold,
        level: threshold.level,
        direction,
        action: threshold.action,
        reason,
      });

      this.logger.log(
        `Alert: ${sensorType} ${direction} ${threshold.threshold} (value=${value}, level=${threshold.level}, action=${threshold.action})`,
      );

      return;
    }
  }

  private isViolated(value: number, threshold: SensorThreshold): boolean {
    return threshold.type === ThresholdType.MIN
      ? value < threshold.threshold
      : value > threshold.threshold;
  }

  private stateKey(
    deviceId: string,
    sensorType: string,
    threshold: SensorThreshold,
  ): string {
    return `${deviceId}:${sensorType}:${threshold.level}:${threshold.type}`;
  }

  private shouldDispatch(stateKey: string): boolean {
    if (this.thresholdStates.get(stateKey) === true) {
      return false;
    }

    const lastTime = this.lastActionTime.get(stateKey);
    if (lastTime && Date.now() - lastTime < this.COOLDOWN_MS) {
      return false;
    }

    this.thresholdStates.set(stateKey, true);
    this.lastActionTime.set(stateKey, Date.now());

    return true;
  }
}
