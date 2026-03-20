---
phase: 4
title: Config Resolution Service
status: completed
priority: critical
effort: M
blockedBy: [1]
completed: 2026-03-20
---

# Phase 4: Config Resolution Service

## Overview

Create the core config resolution service that implements the inheritance chain: Zone → Device with checkAll soft override. This service resolves the active irrigationMode, controlMode, and threshold set for any given device at runtime.

## Context Links

- [Brainstorm Report - Resolution Logic](../reports/brainstorm-260320-0422-zone-hierarchy-refactor.md)
- [Phase 1 - Entities](phase-01-database-entities-module-setup.md)
- [Sensor Service - Config Cache](../../src/sensor/sensor.service.ts) (lines 44-51)
- [Threshold Service](../../src/sensor/threshold.service.ts)

## Key Insights

- Resolution is hot path — called on every telemetry event per device
- Must cache aggressively: zone config, device config, threshold sets
- checkAll=true → zone config wins (device config preserved but ignored)
- checkAll=false → device config ?? zone config (fallback)
- Threshold resolution: device-specific threshold → device default → zone threshold → zone default
- "Default" threshold = irrigationMode is NULL

## Requirements

### Functional
- `resolveConfig(deviceId)` → returns effective { irrigationMode, controlMode }
- `resolveThresholds(deviceId, sensorType, activeIrrigationMode)` → returns thresholds to evaluate
- Cache with invalidation on zone/device config changes
- Handle edge cases: device not in any zone, zone has no config

### Non-functional
- < 5ms resolution time (cached path)
- Memory-efficient caching (Map-based, same pattern as existing SensorService cache)

## Architecture

```
resolveConfig(device):
  zone = device.zone
  if !zone → return device config (or defaults)
  if zone.checkAll:
    return { irrigationMode: zone.irrigationMode, controlMode: zone.controlMode }
  return {
    irrigationMode: device.irrigationMode ?? zone.irrigationMode,
    controlMode: device.controlMode ?? zone.controlMode,
  }

resolveThresholds(sensorConfig, activeIrrigationMode, zone):
  if zone?.checkAll:
    zoneConfig = ZoneSensorConfig.find(zone, sensorType)
    t = ZoneThreshold.find(zoneConfig, level, activeIrrigationMode)
    return t ?? ZoneThreshold.find(zoneConfig, level, null)

  // Device first
  t = SensorThreshold.find(sensorConfig, level, activeIrrigationMode)
  t = t ?? SensorThreshold.find(sensorConfig, level, null)   // device default
  t = t ?? ZoneThreshold.find(zoneConfig, level, activeIrrigationMode)  // zone specific
  t = t ?? ZoneThreshold.find(zoneConfig, level, null)  // zone default
  return t
```

## Related Code Files

### Files to Create
- `src/zone/config-resolution.service.ts`

### Files to Modify
- `src/zone/zone.module.ts` — register service, export it
- (Phase 5 will consume this service in SensorModule)

## Implementation Steps

### Step 1: Create ConfigResolutionService

`src/zone/config-resolution.service.ts`:

```typescript
@Injectable()
export class ConfigResolutionService {
  private readonly logger = new Logger(ConfigResolutionService.name);

  // deviceId → { zone, device config, loadedAt }
  private cache: Map<string, { data: ResolvedDeviceContext; loadedAt: number }> = new Map();
  private readonly CACHE_TTL = 60_000;

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
      device,
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
  ): { minThreshold: number | null; maxThreshold: number | null; action: string; level: ThresholdLevel }[] {
    const { zone, zoneConfigs } = context;
    const zoneConfig = zoneConfigs.find(c => c.sensorType === sensorType);
    const zoneThresholds = zoneConfig?.thresholds ?? [];

    const levels = [ThresholdLevel.CRITICAL, ThresholdLevel.WARNING];
    const result = [];

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

  private pickThreshold(checkAll, deviceThresholds, zoneThresholds, level, irrigationMode) {
    if (checkAll) {
      return this.findThreshold(zoneThresholds, level, irrigationMode)
          ?? this.findThreshold(zoneThresholds, level, null);
    }
    return this.findThreshold(deviceThresholds, level, irrigationMode)
        ?? this.findThreshold(deviceThresholds, level, null)
        ?? this.findThreshold(zoneThresholds, level, irrigationMode)
        ?? this.findThreshold(zoneThresholds, level, null);
  }

  private findThreshold(thresholds, level, irrigationMode) {
    return thresholds.find(t =>
      t.level === level &&
      (irrigationMode === null ? t.irrigationMode == null : t.irrigationMode === irrigationMode)
    ) ?? null;
  }

  invalidateCache(deviceId: string) {
    this.cache.delete(deviceId);
  }

  invalidateCacheByZone(zoneId: string) {
    // Clear all devices in this zone
    for (const [deviceId, entry] of this.cache.entries()) {
      if (entry.data.zone?.id === zoneId) {
        this.cache.delete(deviceId);
      }
    }
  }
}
```

### Step 2: Define interfaces

```typescript
export interface ResolvedDeviceContext {
  device: Device | null;
  zone: Zone | null;
  zoneConfigs: ZoneSensorConfig[];
}

export interface ResolvedConfig {
  irrigationMode: IrrigationMode;
  controlMode: ControlMode;
}
```

### Step 3: Register and export

Update `ZoneModule`:
- Add `TypeOrmModule.forFeature([Zone, ZoneSensorConfig, ZoneThreshold, Device])`
- Provide and export `ConfigResolutionService`

### Step 4: Compile check

Run `yarn build`.

## Todo List

- [x] Define ResolvedDeviceContext and ResolvedConfig interfaces
- [x] Implement ConfigResolutionService
- [x] Implement cache with invalidation (device-level + zone-level)
- [x] Register and export from ZoneModule
- [x] Run `yarn build` — verify no errors

## Success Criteria

- resolveConfig returns correct values for all scenarios:
  - Device not in zone → device defaults
  - Zone checkAll=true → zone config
  - Zone checkAll=false, device has override → device config
  - Zone checkAll=false, device no override → zone config
- resolveThresholds follows full fallback chain
- Cache invalidation works per-device and per-zone

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Cache staleness after zone config change | invalidateCacheByZone clears all devices in zone |
| Performance under high device count | Map-based cache, O(1) lookup per device. Zone invalidation is O(n) but infrequent |
| NULL irrigationMode in threshold matching | Explicit null check in findThreshold |

## Security Considerations

- Service is internal-only, no direct REST exposure
- Consumed by SensorModule (Phase 5) and ScheduleModule (Phase 6)
