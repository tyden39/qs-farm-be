# Phase 4: Integration with ThresholdService + ScheduleService

## Overview
- **Priority:** High
- **Status:** Complete
- **Effort:** 1h

Wire `FcmService` into existing alert and schedule pipelines. Add FCM push after alert logging and schedule execution.

## Files to Modify
- `src/sensor/sensor.module.ts` — import `NotificationModule`
- `src/sensor/threshold.service.ts` — inject `FcmService`, call after alert save
- `src/schedule/schedule.module.ts` — import `NotificationModule`
- `src/schedule/schedule.service.ts` — inject `FcmService`, call after schedule execution

## Implementation Steps

### 1. ThresholdService Integration

**In `src/sensor/sensor.module.ts`:**
```typescript
imports: [
  // ... existing
  NotificationModule, // Add
],
```

**In `src/sensor/threshold.service.ts`:**

Inject `FcmService` in constructor:
```typescript
constructor(
  private readonly mqttService: MqttService,
  private readonly deviceGateway: DeviceGateway,
  private readonly fcmService: FcmService,  // Add
  @InjectRepository(AlertLog)
  private readonly alertLogRepo: Repository<AlertLog>,
  @InjectRepository(CommandLog)
  private readonly commandLogRepo: Repository<CommandLog>,
) {}
```

After `await this.alertLogRepo.save(alertLog)` (line ~153), add:
```typescript
// Push notification via FCM
this.fcmService.sendToDevice(deviceId, alertLog.device?.farmId, {
  title: `${threshold.level} Alert: ${sensorType}`,
  body: reason,
  data: {
    type: 'SENSOR_ALERT',
    deviceId,
    sensorType,
    level: threshold.level,
    alertLogId: alertLog.id,
  },
}).catch((err) => this.logger.error('FCM alert failed:', err.message));
```

**Problem:** `deviceId` is available but `farmId` is not in current `evaluate()` signature.

**Solution:** Add `farmId` parameter to `evaluate()` method. Caller (`SensorService`) already has device with farmId.

Update signature:
```typescript
async evaluate(deviceId: string, farmId: string, config: SensorConfig, value: number)
```

Update caller in `SensorService` where `evaluate()` is called — pass `device.farmId`.

### 2. ScheduleService Integration

**In `src/schedule/schedule.module.ts`:**
```typescript
imports: [
  // ... existing
  NotificationModule, // Add
],
```

**In `src/schedule/schedule.service.ts`:**

Inject `FcmService` in constructor:
```typescript
constructor(
  @InjectRepository(DeviceSchedule)
  private readonly scheduleRepository: Repository<DeviceSchedule>,
  private readonly syncService: SyncService,
  private readonly deviceService: DeviceService,
  private readonly fcmService: FcmService,  // Add
) {}
```

In `execute()` method, after `await this.scheduleRepository.save(schedule)` (line ~242), add:
```typescript
// Push notification for schedule completion
const farmId = schedule.farmId || (schedule.deviceId
  ? (await this.deviceService.findOne(schedule.deviceId))?.farmId
  : null);

if (farmId) {
  this.fcmService.sendToDevice(schedule.deviceId || 'farm', farmId, {
    title: `Schedule: ${schedule.name}`,
    body: `Command "${schedule.command}" executed`,
    data: {
      type: 'SCHEDULE_EXECUTED',
      scheduleId: schedule.id,
      command: schedule.command,
    },
  }).catch((err) => this.logger.error('FCM schedule notification failed:', err.message));
}
```

### 3. Find and update SensorService caller

Need to find where `ThresholdService.evaluate()` is called and add `farmId` argument.

```bash
grep -n 'evaluate(' src/sensor/sensor.service.ts
```

Update the call to include `farmId`:
```typescript
// Before:
await this.thresholdService.evaluate(deviceId, config, value);
// After:
await this.thresholdService.evaluate(deviceId, farmId, config, value);
```

## Key Decisions
- **Fire-and-forget:** FCM calls use `.catch()` — never block alert/schedule flow
- **Anti-spam inherited:** ThresholdService already has 30s cooldown — FCM benefits from same gate
- **No duplicate FCM logic:** Reuse `sendToDevice()` for both alert and schedule paths

## Todo
- [x] Import `NotificationModule` in `SensorModule`
- [x] Inject `FcmService` in `ThresholdService` constructor
- [x] Add `farmId` param to `ThresholdService.evaluate()` signature
- [x] Update `SensorService` caller to pass `farmId`
- [x] Add FCM call after alert save in `ThresholdService`
- [x] Import `NotificationModule` in `ScheduleModule`
- [x] Inject `FcmService` in `ScheduleService` constructor
- [x] Add FCM call after schedule execution in `ScheduleService`
- [x] Run `yarn build` to verify
- [ ] Test end-to-end: trigger threshold → verify FCM payload in Firebase console

## As-Built Deviations
- `FcmService.sendToDevice()` renamed to `sendToFarmOwner()` — signature change propagated here
- FCM call in `ThresholdService` uses `sendToFarmOwner(farmId, notification)` (no `deviceId` arg)

## Success Criteria
- Sensor CRITICAL/WARNING alerts trigger FCM push
- Schedule execution triggers FCM push
- FCM failures don't break alert/schedule pipelines
- Anti-spam still works (no notification spam)

## Risk Assessment
- **Breaking change:** `evaluate()` signature change — must update all callers
- **Mitigation:** Search for all `evaluate(` calls in sensor module, update each
