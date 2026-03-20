---
phase: 5
title: Sensor Pipeline Integration
status: completed
priority: critical
effort: L
blockedBy: [3, 4]
completed: 2026-03-20
---

# Phase 5: Sensor Pipeline Integration

## Overview

Integrate ConfigResolutionService into the telemetry processing pipeline. Modify SensorService and ThresholdService to use resolved config (active irrigationMode) and resolved thresholds (zone/device fallback chain) instead of directly reading device-level thresholds.

## Context Links

- [Phase 4 - Config Resolution](phase-04-config-resolution-service.md)
- [Sensor Service](../../src/sensor/sensor.service.ts) — processTelemetry (line 69)
- [Threshold Service](../../src/sensor/threshold.service.ts) — evaluate (line 65)
- [Sync Service](../../src/device/sync/sync.service.ts) — telemetry event emission (line 164)

## Key Insights

- `SensorService.processTelemetry()` is the entry point — called on every `telemetry.received` event
- Currently reads device's SensorConfig (cached 60s) and evaluates thresholds directly
- Need to inject ConfigResolutionService and resolve active irrigationMode BEFORE threshold evaluation
- ThresholdService.evaluate() currently receives `SensorConfig` with `thresholds[]` — need to pass resolved thresholds instead
- SyncService already passes `farmId` in event — also pass `zoneId` for WS room broadcasts
- Must add `zoneId` to telemetry event so zone-level WS rooms can be supported (future)

## Requirements

### Functional
- processTelemetry resolves active irrigationMode via ConfigResolutionService
- ThresholdService.evaluate() uses resolved thresholds (not raw device thresholds)
- SyncService caches zoneId alongside farmId
- Cache invalidation wired: zone config changes → invalidate resolution cache
- Existing telemetry flow continues to work for devices NOT in any zone

### Non-functional
- < 10ms overhead added to telemetry pipeline (cached path)
- No breaking changes to existing event interfaces

## Architecture

### Current Flow
```
telemetry.received → SensorService.processTelemetry()
  → getConfigsForDevice(deviceId) [cached]
  → for each reading:
      config.thresholds → ThresholdService.evaluate(deviceId, farmId, config, value)
```

### New Flow
```
telemetry.received → SensorService.processTelemetry()
  → getConfigsForDevice(deviceId) [cached — device thresholds]
  → configResolution.getDeviceContext(deviceId) [cached — zone context]
  → resolvedConfig = resolveConfig(context) → get activeIrrigationMode
  → for each reading:
      resolvedThresholds = resolveThresholdsForSensor(context, config.thresholds, sensorType, activeIrrigationMode)
      → ThresholdService.evaluate(deviceId, farmId, resolvedThresholds, value)
```

## Related Code Files

### Files to Modify
- `src/sensor/sensor.module.ts` — import ZoneModule
- `src/sensor/sensor.service.ts` — inject ConfigResolutionService, update processTelemetry
- `src/sensor/threshold.service.ts` — accept resolved thresholds array (minor signature change)
- `src/device/sync/sync.service.ts` — cache and pass zoneId in events
- `src/zone/zone-sensor-config.service.ts` — emit cache invalidation on changes
- `src/zone/zone.service.ts` — emit cache invalidation on checkAll/irrigationMode changes

## Implementation Steps

### Step 1: Update SyncService to cache zoneId

Add `zoneId` to farmId cache in `src/device/sync/sync.service.ts`:
```typescript
// Change cache type
private deviceContextCache: Map<string, {
  farmId: string | null;
  zoneId: string | null;
  loadedAt: number;
}> = new Map();

// Update getFarmId → getDeviceContext
private async getDeviceIds(deviceId: string) {
  const cached = this.deviceContextCache.get(deviceId);
  if (cached && Date.now() - cached.loadedAt < this.FARM_CACHE_TTL) {
    return cached;
  }
  const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
  const entry = {
    farmId: device?.farmId ?? null,
    zoneId: device?.zoneId ?? null,
    loadedAt: Date.now(),
  };
  this.deviceContextCache.set(deviceId, entry);
  return entry;
}
```

Pass `zoneId` in telemetry event:
```typescript
this.eventEmitter.emit('telemetry.received', {
  deviceId,
  payload,
  timestamp,
  farmId,
  zoneId,  // NEW
});
```

### Step 2: Update SensorModule imports

`src/sensor/sensor.module.ts` — add `ZoneModule` to imports so `ConfigResolutionService` is available.

### Step 3: Update SensorService.processTelemetry()

Inject `ConfigResolutionService`:
```typescript
constructor(
  // ... existing deps
  private readonly configResolution: ConfigResolutionService,
) {}
```

Update `processTelemetry()`:
```typescript
@OnEvent('telemetry.received')
async processTelemetry(event: TelemetryEvent) {
  const { deviceId, payload } = event;

  try {
    // ... existing reading parse + sensor data insert ...

    const configs = await this.getConfigsForDevice(deviceId);
    const farmId = event.farmId;

    // NEW: resolve zone context and active config
    const context = await this.configResolution.getDeviceContext(deviceId);
    const resolvedConfig = this.configResolution.resolveConfig(context);

    for (const reading of readings) {
      const config = configs.find(
        (c) => c.sensorType === reading.sensorType && c.enabled && c.mode === SensorMode.AUTO,
      );
      if (!config) continue;

      // NEW: resolve thresholds using fallback chain
      const resolvedThresholds = this.configResolution.resolveThresholdsForSensor(
        context,
        config.thresholds || [],
        reading.sensorType as SensorType,
        resolvedConfig.irrigationMode,
      );

      if (resolvedThresholds.length === 0) continue;

      await this.thresholdService.evaluate(
        deviceId,
        farmId,
        config,
        reading.value,
        resolvedThresholds,  // NEW param
      );
    }
  } catch (error) { ... }
}
```

### Step 4: Update ThresholdService.evaluate() signature

Change from using `config.thresholds` to accepting resolved thresholds:

```typescript
async evaluate(
  deviceId: string,
  farmId: string | undefined,
  config: SensorConfig,
  value: number,
  resolvedThresholds?: any[],  // NEW optional param for backward compat
) {
  const { sensorType } = config;

  // Use resolved thresholds if provided, otherwise fall back to config.thresholds
  const thresholds = resolvedThresholds ?? config.thresholds ?? [];

  // Sort: CRITICAL first, then WARNING
  const sorted = [...thresholds].sort((a, b) => { ... });
  // ... rest remains the same
}
```

### Step 5: Wire cache invalidation

In `ZoneSensorConfigService` — after create/update/delete zone threshold:
```typescript
this.configResolution.invalidateCacheByZone(zoneId);
```

In `ZoneService` — after update zone (checkAll, irrigationMode, controlMode change):
```typescript
this.configResolution.invalidateCacheByZone(zoneId);
```

In existing `SensorService` — after threshold create/update/delete:
```typescript
this.configResolution.invalidateCache(deviceId);
```

### Step 6: Compile check

Run `yarn build`.

## Todo List

- [x] Update SyncService: cache zoneId, pass in events
- [x] Update TelemetryEvent interface: add zoneId
- [x] Import ZoneModule in SensorModule
- [x] Inject ConfigResolutionService in SensorService
- [x] Update processTelemetry: resolve config + thresholds
- [x] Update ThresholdService.evaluate: accept resolved thresholds
- [x] Wire cache invalidation in zone services
- [x] Wire cache invalidation in existing sensor service
- [x] Run `yarn build` — verify no errors

## Success Criteria

- Telemetry from device in zone with checkAll=true uses zone thresholds
- Telemetry from device with own thresholds uses device thresholds (checkAll=false)
- Telemetry from device without zone uses device thresholds (backward compat)
- Threshold evaluation respects active irrigationMode
- Fallback chain: device(mode) → device(null) → zone(mode) → zone(null)
- No performance regression on telemetry pipeline

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Circular dependency SensorModule ↔ ZoneModule | Build failure | ZoneModule exports ConfigResolutionService. SensorModule imports ZoneModule. No reverse dep. |
| Performance regression on hot path | Slower telemetry processing | ConfigResolutionService uses 60s cache, same pattern as existing config cache |
| Backward compat for devices without zone | Broken threshold eval | resolvedThresholds param is optional, falls back to config.thresholds |
| Cache inconsistency after rapid zone config changes | Stale thresholds for up to 60s | Acceptable — same TTL as existing sensor config cache. Manual invalidation on config changes mitigates. |

## Security Considerations

- No new endpoints exposed
- Config resolution is internal service only
- Zone access already validated in CRUD endpoints (Phase 2/3)
