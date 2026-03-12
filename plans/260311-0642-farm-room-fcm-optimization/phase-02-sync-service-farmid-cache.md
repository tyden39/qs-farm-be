---
phase: 2
status: completed
priority: high
effort: 45min
depends_on: [phase-01]
completed: 2026-03-11
---

# Phase 2: SyncService FarmId Cache + SensorService Query Elimination

## Context
- [plan.md](plan.md)
- [DB Issue 3](../reports/brainstorm-260311-0332-database-dataflow-analysis.md) — 120 unnecessary queries/min
- Files: `src/device/sync/sync.service.ts`, `src/sensor/sensor.service.ts`

## Overview
Add deviceId→farmId cache in SyncService. Pass farmId through telemetry events. Remove redundant Device query in SensorService. Enable farm-level WebSocket broadcasts.

## Key Insights
- SensorService currently queries `deviceRepo.findOne(deviceId)` on EVERY telemetry event just for farmId
- 10 devices × 6 sensors × 2 readings/min = 120 unnecessary DB queries/min
- SyncService already processes telemetry before SensorService — perfect place to cache and forward farmId
- Cache pattern: same as existing `configCache` in SensorService (Map + 60s TTL)

## Architecture

```
BEFORE:
  SyncService.handleDeviceTelemetry()
    → emit('telemetry.received', { deviceId, payload })
  SensorService.processTelemetry()
    → deviceRepo.findOne(deviceId)  ← UNNECESSARY QUERY
    → thresholdService.evaluate(deviceId, farmId, ...)

AFTER:
  SyncService.handleDeviceTelemetry()
    → farmId = cache.get(deviceId) || deviceRepo.findOne(deviceId)
    → broadcastDeviceData(deviceId, data, farmId)  ← farm room broadcast
    → emit('telemetry.received', { deviceId, payload, farmId })  ← pass farmId
  SensorService.processTelemetry()
    → farmId = event.farmId  ← from event, NO query
    → thresholdService.evaluate(deviceId, farmId, ...)
```

## Related Code Files
- **Modify:** `src/device/sync/sync.service.ts`
- **Modify:** `src/sensor/sensor.service.ts`

## Implementation Steps

### 1. SyncService — Inject DeviceRepository
```typescript
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../entities/device.entity';

constructor(
  private readonly mqttService: MqttService,
  private readonly deviceGateway: DeviceGateway,
  private readonly provisionService: ProvisionService,
  private readonly eventEmitter: EventEmitter2,
  @InjectRepository(Device)
  private readonly deviceRepo: Repository<Device>,
) {}
```

No module change needed — `TypeOrmModule.forFeature([Device])` already in DeviceModule.

### 2. SyncService — Add farmId cache
```typescript
// deviceId → farmId cache (60s TTL)
private farmIdCache: Map<string, { farmId: string | null; loadedAt: number }> = new Map();
private readonly FARM_CACHE_TTL = 60_000;

private async getFarmId(deviceId: string): Promise<string | null> {
  const cached = this.farmIdCache.get(deviceId);
  if (cached && Date.now() - cached.loadedAt < this.FARM_CACHE_TTL) {
    return cached.farmId;
  }
  const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
  const farmId = device?.farmId ?? null;
  this.farmIdCache.set(deviceId, { farmId, loadedAt: Date.now() });
  return farmId;
}
```

### 3. SyncService — Update handleDeviceTelemetry
```typescript
private async handleDeviceTelemetry(message: MqttMessage) {
  const { deviceId, payload, timestamp } = message;
  this.logger.debug(`Processing telemetry from ${deviceId}`);

  const farmId = await this.getFarmId(deviceId);

  // Broadcast to device room + farm room
  this.deviceGateway.broadcastDeviceData(deviceId, {
    type: 'telemetry',
    ...payload,
    receivedAt: timestamp,
  }, farmId);

  // Pass farmId in event — SensorService won't need to query Device
  this.eventEmitter.emit('telemetry.received', {
    deviceId,
    payload,
    timestamp,
    farmId,
  });
}
```

### 4. SyncService — Update handleDeviceStatus
```typescript
private async handleDeviceStatus(message: MqttMessage) {
  const { deviceId, payload, timestamp } = message;
  this.logger.debug(`Processing device status from ${deviceId}`);

  const farmId = await this.getFarmId(deviceId);

  this.deviceGateway.broadcastDeviceStatus(deviceId, {
    ...payload,
    receivedAt: timestamp,
  }, farmId);
}
```

### 5. SensorService — Update TelemetryEvent interface
```typescript
interface TelemetryEvent {
  deviceId: string;
  payload: any;
  timestamp: Date;
  farmId?: string; // Added: passed from SyncService
}
```

### 6. SensorService — Remove redundant Device query in processTelemetry
```typescript
// BEFORE (line 99):
const device = await this.deviceRepo.findOne(deviceId);
const farmId = device?.farmId;

// AFTER:
const farmId = event.farmId;
```

Also remove `Device` import and `deviceRepo` injection from SensorService if no other methods use it.

### 7. Check if SensorService uses deviceRepo elsewhere
Search for `this.deviceRepo` in sensor.service.ts — if only used for farmId lookup in processTelemetry and in `getFarmDashboard` (which queries by farmId, not by deviceId), then:
- Keep deviceRepo for `getFarmDashboard` and other report queries
- Only remove the findOne call in `processTelemetry`

## Todo List
- [x] Inject DeviceRepository into SyncService constructor
- [x] Add farmId cache with 60s TTL to SyncService
- [x] Add `getFarmId(deviceId)` private method
- [x] Update `handleDeviceTelemetry` — lookup farmId, pass to broadcast + event
- [x] Update `handleDeviceStatus` — lookup farmId, pass to broadcast
- [x] Update `TelemetryEvent` interface in SensorService
- [x] Remove `deviceRepo.findOne(deviceId)` from `processTelemetry` — use `event.farmId`
- [x] Verify `yarn build` compiles

## Success Criteria
- SyncService caches deviceId→farmId (verified via debug logs)
- Telemetry events include farmId in payload
- SensorService.processTelemetry no longer queries Device table
- Device data broadcasts reach farm room subscribers
- Existing per-device subscriptions still work

## Risk Assessment
- **Low risk:** Cache invalidation — 60s TTL is acceptable since farmId rarely changes (only on device pairing/unpairing)
- **Edge case:** Device paired to new farm during cache window — stale farmId for max 60s. Acceptable for real-time telemetry. If strict consistency needed, invalidate cache on pair/unpair events (YAGNI for now).
