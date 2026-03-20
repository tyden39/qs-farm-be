import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Device } from 'src/device/entities/device.entity';
import { Zone } from './entities/zone.entity';
import { ZoneSensorConfig } from './entities/zone-sensor-config.entity';
import { SensorThreshold } from 'src/sensor/entities/sensor-threshold.entity';
import { ZoneThreshold } from './entities/zone-threshold.entity';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ControlMode } from 'src/shared/enums/control-mode.enum';
import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';

export interface ResolvedDeviceContext {
  device: Device | null;
  zone: Zone | null;
  zoneConfigs: ZoneSensorConfig[];
}

export interface ResolvedConfig {
  irrigationMode: IrrigationMode;
  controlMode: ControlMode;
}

export type ResolvedThreshold = {
  minThreshold: number | null;
  maxThreshold: number | null;
  action: string;
  level: ThresholdLevel;
};

@Injectable()
export class ConfigResolutionService {
  private readonly logger = new Logger(ConfigResolutionService.name);
  private readonly CACHE_TTL = 60_000;

  // deviceId → { data, loadedAt }
  private cache: Map<string, { data: ResolvedDeviceContext; loadedAt: number }> = new Map();

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Zone)
    private readonly zoneRepo: Repository<Zone>,
    @InjectRepository(ZoneSensorConfig)
    private readonly zoneConfigRepo: Repository<ZoneSensorConfig>,
  ) {}

  async getDeviceContext(deviceId: string): Promise<ResolvedDeviceContext> {
    const cached = this.cache.get(deviceId);
    if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL) {
      return cached.data;
    }

    const device = await this.deviceRepo.findOne({
      where: { id: deviceId },
      relations: ['zone'],
    });

    let zoneConfigs: ZoneSensorConfig[] = [];
    if (device?.zoneId) {
      zoneConfigs = await this.zoneConfigRepo.find({
        where: { zoneId: device.zoneId },
        relations: ['thresholds'],
      });
    }

    const data: ResolvedDeviceContext = {
      device: device ?? null,
      zone: device?.zone ?? null,
      zoneConfigs,
    };

    this.cache.set(deviceId, { data, loadedAt: Date.now() });
    return data;
  }

  resolveConfig(context: ResolvedDeviceContext): ResolvedConfig {
    const { device, zone } = context;

    if (!zone) {
      return {
        irrigationMode: device?.irrigationMode ?? IrrigationMode.NORMAL,
        controlMode: device?.controlMode ?? ControlMode.MANUAL,
      };
    }

    if (zone.checkAll) {
      return {
        irrigationMode: zone.irrigationMode,
        controlMode: zone.controlMode,
      };
    }

    return {
      irrigationMode: device?.irrigationMode ?? zone.irrigationMode,
      controlMode: device?.controlMode ?? zone.controlMode,
    };
  }

  resolveThresholdsForSensor(
    context: ResolvedDeviceContext,
    deviceThresholds: SensorThreshold[],
    sensorType: SensorType,
    activeIrrigationMode: IrrigationMode,
  ): ResolvedThreshold[] {
    const { zone, zoneConfigs } = context;
    const zoneConfig = zoneConfigs.find((c) => c.sensorType === sensorType);
    const zoneThresholds: ZoneThreshold[] = zoneConfig?.thresholds ?? [];

    const levels = [ThresholdLevel.CRITICAL, ThresholdLevel.WARNING];
    const result: ResolvedThreshold[] = [];

    for (const level of levels) {
      const threshold = this.pickThreshold(
        zone?.checkAll ?? false,
        deviceThresholds,
        zoneThresholds,
        level,
        activeIrrigationMode,
      );
      if (threshold) result.push(threshold);
    }

    return result;
  }

  private pickThreshold(
    checkAll: boolean,
    deviceThresholds: SensorThreshold[],
    zoneThresholds: ZoneThreshold[],
    level: ThresholdLevel,
    irrigationMode: IrrigationMode,
  ): ResolvedThreshold | null {
    if (checkAll) {
      return (
        this.findZoneThreshold(zoneThresholds, level, irrigationMode) ??
        this.findZoneThreshold(zoneThresholds, level, null)
      );
    }

    return (
      this.findDeviceThreshold(deviceThresholds, level, irrigationMode) ??
      this.findDeviceThreshold(deviceThresholds, level, null) ??
      this.findZoneThreshold(zoneThresholds, level, irrigationMode) ??
      this.findZoneThreshold(zoneThresholds, level, null)
    );
  }

  private findDeviceThreshold(
    thresholds: SensorThreshold[],
    level: ThresholdLevel,
    irrigationMode: IrrigationMode | null,
  ): ResolvedThreshold | null {
    const t = thresholds.find(
      (th) =>
        th.level === level &&
        (irrigationMode === null ? th.irrigationMode == null : th.irrigationMode === irrigationMode),
    );
    if (!t) return null;
    return { minThreshold: t.minThreshold, maxThreshold: t.maxThreshold, action: t.action, level: t.level };
  }

  private findZoneThreshold(
    thresholds: ZoneThreshold[],
    level: ThresholdLevel,
    irrigationMode: IrrigationMode | null,
  ): ResolvedThreshold | null {
    const t = thresholds.find(
      (th) =>
        th.level === level &&
        (irrigationMode === null ? th.irrigationMode == null : th.irrigationMode === irrigationMode),
    );
    if (!t) return null;
    return { minThreshold: t.minThreshold, maxThreshold: t.maxThreshold, action: t.action, level: t.level };
  }

  invalidateCache(deviceId: string): void {
    this.cache.delete(deviceId);
  }

  invalidateCacheByZone(zoneId: string): void {
    for (const [deviceId, entry] of this.cache.entries()) {
      if (entry.data.zone?.id === zoneId) {
        this.cache.delete(deviceId);
      }
    }
  }
}
