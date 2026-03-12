---
phase: 3
status: completed
priority: medium
effort: 30min
depends_on: [phase-01]
completed: 2026-03-11
---

# Phase 3: Conditional FCM — Skip When WebSocket Connected

## Context
- [plan.md](plan.md)
- [temp.md Issue 3](../reports/temp.md) — Double notification risk
- Files: `src/sensor/threshold.service.ts`, `src/schedule/schedule.service.ts`

## Overview
Check if farm owner has active WebSocket connection before sending FCM push. If connected → WebSocket already delivers real-time alerts, skip FCM. If offline → send FCM as usual.

## Key Insights
- Current: ThresholdService + ScheduleService both call `fcmService.sendToFarmOwner()` unconditionally
- Mobile online + subscribed → receives BOTH WebSocket event AND FCM notification (duplicate)
- `DeviceGateway.isUserConnected(userId)` added in Phase 1
- Need farm owner's userId → already available via `Farm.userId` relation
- FCM `alertLogId` already in data payload (threshold.service.ts line 185) — dedup possible on mobile side too

## Architecture

```
BEFORE:
  ThresholdService.evaluate()
    → WebSocket: broadcastDeviceData('alert', ...)
    → FCM: sendToFarmOwner(farmId, ...)     ← ALWAYS sent

AFTER:
  ThresholdService.evaluate()
    → WebSocket: broadcastDeviceData('alert', ...)
    → if (!isUserConnected(farmOwnerId)):
        FCM: sendToFarmOwner(farmId, ...)   ← ONLY when offline
```

## Related Code Files
- **Modify:** `src/sensor/threshold.service.ts`
- **Modify:** `src/schedule/schedule.service.ts`

## Implementation Steps

### 1. ThresholdService — Inject DeviceGateway (already injected) + Farm repo

ThresholdService already has `DeviceGateway` injected. Need to look up farm owner userId.

Option A (simple): Inject `FarmRepository` to query `farm.userId`
Option B (simpler): Pass `farmOwnerId` from SensorService alongside `farmId`

**Choose Option A** — ThresholdService already has farmId, one simple query with cache.

```typescript
import { Farm } from 'src/farm/entities/farm.entity';

// Add to constructor:
@InjectRepository(Farm)
private readonly farmRepo: Repository<Farm>,

// Add cache:
private farmOwnerCache: Map<string, { userId: string; loadedAt: number }> = new Map();
private readonly FARM_OWNER_CACHE_TTL = 300_000; // 5 min — farm owner rarely changes

private async getFarmOwnerId(farmId: string): Promise<string | null> {
  const cached = this.farmOwnerCache.get(farmId);
  if (cached && Date.now() - cached.loadedAt < this.FARM_OWNER_CACHE_TTL) {
    return cached.userId;
  }
  const farm = await this.farmRepo.findOne({ where: { id: farmId } });
  if (!farm) return null;
  this.farmOwnerCache.set(farmId, { userId: farm.userId, loadedAt: Date.now() });
  return farm.userId;
}
```

**Note:** Need to add `TypeOrmModule.forFeature([Farm])` to SensorModule imports, or import FarmModule.

### 2. ThresholdService — Conditional FCM in evaluate()

Replace current unconditional FCM block (lines 175-188):

```typescript
// Push notification via FCM — only when user is offline
if (farmId) {
  const farmOwnerId = await this.getFarmOwnerId(farmId);
  const isOnline = farmOwnerId && this.deviceGateway.isUserConnected(farmOwnerId);

  if (!isOnline) {
    this.fcmService
      .sendToFarmOwner(farmId, {
        title: `${THRESHOLD_LEVEL_LABEL[threshold.level] ?? threshold.level}: ${SENSOR_TYPE_LABEL[sensorType] ?? sensorType}`,
        body: reason ?? `${SENSOR_TYPE_LABEL[sensorType] ?? sensorType} ${direction === AlertDirection.BELOW ? 'dưới mức' : 'vượt mức'}`,
        data: {
          type: 'SENSOR_ALERT',
          deviceId,
          sensorType,
          level: threshold.level,
          alertLogId: alertLog.id,
        },
      })
      .catch((err) => this.logger.error('FCM alert failed:', err.message));
  } else {
    this.logger.debug(`Skipping FCM for ${deviceId} — user ${farmOwnerId} is online`);
  }
}
```

### 3. ScheduleService — Same pattern

ScheduleService also calls `fcmService.sendToFarmOwner()` after schedule execution (line 255).

Add same check:
```typescript
// Only send FCM if user is not connected via WebSocket
const farmOwnerId = await this.getFarmOwnerId(farmId);
const isOnline = farmOwnerId && this.deviceGateway.isUserConnected(farmOwnerId);

if (!isOnline) {
  this.fcmService
    .sendToFarmOwner(farmId, { ... })
    .catch(...);
}
```

ScheduleService needs:
- Inject `DeviceGateway` (add to constructor + ScheduleModule imports DeviceModule — already does)
- Same `getFarmOwnerId` cache — or extract to shared utility

**DRY consideration:** Both ThresholdService and ScheduleService need `getFarmOwnerId`. Options:
- A) Duplicate the cache in both (simple, 2 services only)
- B) Add `getUserIdByFarmId()` to FcmService (centralized)
- C) Add check inside FcmService itself

**Choose B** — add to FcmService since it already queries farm for tokens:
```typescript
// In FcmService:
async shouldSendNotification(farmId: string, gateway: DeviceGateway): Promise<boolean> {
  // ... check farm owner online status
}
```

Actually, **Choose A (duplicate)** — KISS. Only 2 call sites. Extracting adds coupling between FcmService and DeviceGateway. Each service manages its own cache independently.

### 4. SensorModule — Add Farm entity to imports

```typescript
// sensor.module.ts
imports: [
  TypeOrmModule.forFeature([
    SensorConfig, SensorThreshold, SensorData,
    AlertLog, CommandLog, Device, Farm,  // ← add Farm
  ]),
  // ...
],
```

### 5. ScheduleModule — Add Farm entity + DeviceGateway access

Check if ScheduleModule already imports DeviceModule (for SyncService access). If yes, DeviceGateway is already available.

```typescript
// schedule.module.ts — verify DeviceModule is imported
imports: [
  TypeOrmModule.forFeature([DeviceSchedule, Farm]),  // ← add Farm
  DeviceModule,  // ← should already exist
  // ...
],
```

## Todo List
- [x] Add `getFarmOwnerId()` with cache to ThresholdService
- [x] Wrap FCM call in ThresholdService with `isUserConnected` check
- [x] Add Farm to SensorModule's TypeOrmModule.forFeature
- [x] Add `getFarmOwnerId()` with cache to ScheduleService
- [x] Wrap FCM call in ScheduleService with `isUserConnected` check
- [x] Ensure ScheduleModule imports DeviceModule + Farm entity
- [x] Verify `yarn build` compiles

## Success Criteria
- FCM NOT sent when farm owner has active WebSocket connection
- FCM sent normally when farm owner is offline
- Debug logs show "Skipping FCM — user online" when applicable
- No behavioral change for offline users

## Risk Assessment
- **Race condition:** User disconnects WS between check and FCM decision → misses notification. Acceptable — next alert will send FCM if still offline. 30s anti-spam cooldown limits impact.
- **Multi-device user:** User has phone + tablet. Phone online (WS), tablet offline. Skipping FCM means tablet doesn't get notification. Acceptable for current single-user stage. Future fix: check per-token online status instead of per-user.
- **Farm owner cache staleness:** 5 min TTL. Farm ownership transfer is extremely rare. Acceptable.
