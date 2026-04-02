import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';
import { Farm } from 'src/farm/entities/farm.entity';
import { SensorConfig } from './entities/sensor-config.entity';
import { AlertLog, AlertDirection } from './entities/alert-log.entity';
import { CommandLog, CommandSource } from './entities/command-log.entity';
import { ThresholdLevel } from './enums/threshold-level.enum';
import { SENSOR_REASON_MAP } from './constants/threshold-rules';
import { SENSOR_TYPE_LABEL } from './enums/sensor-type.enum';
import { FcmService } from 'src/notification/fcm.service';
import type { ResolvedThreshold } from 'src/zone/config-resolution.service';

const THRESHOLD_LEVEL_LABEL: Record<string, string> = {
  critical: 'Nguy hiểm',
  warning: 'Cảnh báo',
};

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

  // farmId → farm owner userId cache (5min TTL)
  private farmOwnerCache: Map<string, { userId: string; loadedAt: number }> =
    new Map();
  private readonly FARM_OWNER_CACHE_TTL = 300_000;

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
    private readonly fcmService: FcmService,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    @InjectRepository(CommandLog)
    private readonly commandLogRepo: Repository<CommandLog>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
  ) {}

  private async getFarmOwnerId(farmId: string): Promise<string | null> {
    const cached = this.farmOwnerCache.get(farmId);
    if (cached && Date.now() - cached.loadedAt < this.FARM_OWNER_CACHE_TTL) {
      return cached.userId;
    }
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) return null;
    this.farmOwnerCache.set(farmId, {
      userId: farm.userId,
      loadedAt: Date.now(),
    });
    return farm.userId;
  }

  async evaluate(
    deviceId: string,
    farmId: string | undefined,
    config: SensorConfig,
    value: number,
    resolvedThresholds?: ResolvedThreshold[],
  ) {
    const { sensorType } = config;

    // Use resolved thresholds if provided (zone/device fallback chain), else raw config thresholds
    const thresholds = resolvedThresholds ?? config.thresholds ?? [];

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
          await this.mqttService.publishToDevice(deviceId, threshold.action, {
            reason,
            sensorType,
            level: threshold.level,
            value,
            threshold: thresholdValue,
          });

          this.deviceGateway.broadcastDeviceData(
            deviceId,
            {
              type: 'command_dispatched',
              command: threshold.action,
              sensorType,
              level: threshold.level,
              value,
              threshold: thresholdValue,
              reason,
            },
            farmId,
          );

          await this.commandLogRepo.save(
            this.commandLogRepo.create({
              deviceId,
              command: threshold.action,
              params: {
                reason,
                sensorType,
                level: threshold.level,
                value,
                threshold: thresholdValue,
              },
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

          await this.commandLogRepo
            .save(
              this.commandLogRepo.create({
                deviceId,
                command: threshold.action,
                params: {
                  reason,
                  sensorType,
                  level: threshold.level,
                  value,
                  threshold: thresholdValue,
                },
                source: CommandSource.AUTOMATED,
                sensorType,
                reason,
                success: false,
                errorMessage: error.message,
              }),
            )
            .catch((e) => this.logger.error('Failed to log command:', e));
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

      // Push notification via FCM — only when user is offline
      if (farmId) {
        const farmOwnerId = await this.getFarmOwnerId(farmId);
        const isOnline =
          farmOwnerId && this.deviceGateway.isUserConnected(farmOwnerId);

        if (!isOnline) {
          this.fcmService
            .sendToFarmOwner(farmId, {
              title: `${
                THRESHOLD_LEVEL_LABEL[threshold.level] ?? threshold.level
              }: ${SENSOR_TYPE_LABEL[sensorType] ?? sensorType}`,
              body:
                reason ??
                `${SENSOR_TYPE_LABEL[sensorType] ?? sensorType} ${
                  direction === AlertDirection.BELOW ? 'dưới mức' : 'vượt mức'
                }`,
              data: {
                type: 'SENSOR_ALERT',
                deviceId,
                sensorType,
                level: threshold.level,
                alertLogId: alertLog.id,
              },
            })
            .catch((err) =>
              this.logger.error('FCM alert failed:', err.message),
            );
        } else {
          this.logger.debug(
            `Skipping FCM for ${deviceId} — user ${farmOwnerId} is online`,
          );
        }
      }

      // Broadcast alert to WebSocket (device + farm rooms)
      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'alert',
          sensorType,
          value,
          threshold: thresholdValue,
          level: threshold.level,
          direction,
          action: threshold.action,
          reason,
        },
        farmId,
      );

      this.logger.log(
        `Alert: ${sensorType} ${direction} ${thresholdValue} (value=${value}, level=${threshold.level}, action=${threshold.action})`,
      );

      // Stop at first violation (CRITICAL takes priority)
      return;
    }

    // No violation — clear state for this sensor's actions
    this.clearStatesForSensor(deviceId, thresholds);
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

  private clearStatesForSensor(
    deviceId: string,
    thresholds: { action: string }[],
  ) {
    const deviceStateMap = this.deviceStates.get(deviceId);
    if (!deviceStateMap) return;

    for (const threshold of thresholds) {
      deviceStateMap.delete(threshold.action);
    }
  }
}
