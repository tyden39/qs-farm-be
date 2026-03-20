---
phase: 6
title: Zone Pump Control & Schedule
status: completed
priority: high
effort: M
blockedBy: [2, 4]
completed: 2026-03-20
---

# Phase 6: Zone Pump Control & Schedule

## Overview

Implement zone-level pump toggle (sends command to all devices in zone) and zone-level schedule support (schedules targeting a zone execute on all zone devices). Update existing schedule execution engine to handle zoneId.

## Context Links

- [Phase 2 - Zone CRUD](phase-02-zone-crud-api.md)
- [Phase 4 - Config Resolution](phase-04-config-resolution-service.md)
- [Schedule Service](../../src/schedule/schedule.service.ts)
- [Sync Service](../../src/device/sync/sync.service.ts) — sendCommandToDevice
- [Pump Service](../../src/pump/pump.service.ts)
- [DeviceSchedule Entity](../../src/schedule/entities/device-schedule.entity.ts)

## Key Insights

- Zone pump toggle = iterate all devices in zone, call `SyncService.sendCommandToDevice()` for each
- Schedule already supports farmId OR deviceId (XOR). Now add zoneId as third option.
- Schedule execution for zone: query all devices in zone, send command to each
- Zone pump toggle endpoint lives in ZoneController
- Pump toggle should use resolved irrigationMode from ConfigResolutionService
- FCM notification: resolve farm owner from zone → farm → user

## Requirements

### Functional
- `POST /api/zone/:zoneId/pump` — toggle pump for all devices in zone
- Schedule CRUD: accept zoneId alongside existing deviceId/farmId
- Schedule execution engine: handle zoneId target (send to all zone devices)
- Pump toggle includes irrigationMode in command payload (resolved from zone)
- Proper validation: exactly one of deviceId/farmId/zoneId

### Non-functional
- Parallel command dispatch to zone devices (Promise.allSettled)
- Error handling per-device (don't fail all if one device fails)

## Related Code Files

### Files to Modify
- `src/zone/zone.controller.ts` — add pump toggle endpoint
- `src/zone/zone.service.ts` — add pump toggle method
- `src/zone/zone.module.ts` — import DeviceModule for SyncService
- `src/schedule/schedule.service.ts` — update validateTarget, execute, findAll
- `src/schedule/dto/create-device-schedule.dto.ts` — add zoneId
- `src/schedule/dto/update-device-schedule.dto.ts` — add zoneId
- `src/schedule/schedule.module.ts` — import ZoneModule if needed

## Implementation Steps

### Step 1: Add pump toggle to ZoneService

```typescript
async togglePump(zoneId: string, action: 'PUMP_ON' | 'PUMP_OFF') {
  const zone = await this.zoneRepo.findOne({
    where: { id: zoneId },
    relations: ['devices'],
  });
  if (!zone) throw new NotFoundException('Zone not found');

  const results = await Promise.allSettled(
    zone.devices.map(device =>
      this.syncService.sendCommandToDevice(device.id, action, {
        irrigationMode: zone.irrigationMode,
        source: 'zone',
        zoneId,
      }),
    ),
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  // Update zone pumpEnabled state
  zone.pumpEnabled = action === 'PUMP_ON';
  await this.zoneRepo.save(zone);

  return { zoneId, action, succeeded, failed, total: zone.devices.length };
}
```

### Step 2: Add pump toggle endpoint

In `ZoneController`:
```typescript
@Post(':id/pump')
@UseGuards(JwtAuthGuard) @ApiBearerAuth()
async togglePump(
  @Param('id') id: string,
  @Body() body: { action: 'PUMP_ON' | 'PUMP_OFF' },
) {
  return this.zoneService.togglePump(id, body.action);
}
```

### Step 3: Update ZoneModule

Import `DeviceModule` to get access to `SyncService`.

### Step 4: Update Schedule DTOs

Add `zoneId` to `CreateDeviceScheduleDto`:
```typescript
@IsOptional() @IsUUID()
zoneId?: string;
```

Same for `UpdateDeviceScheduleDto`.

### Step 5: Update ScheduleService.validateTarget

Change from XOR(deviceId, farmId) to exactly-one-of(deviceId, farmId, zoneId):
```typescript
private validateTarget(deviceId?: string, farmId?: string, zoneId?: string) {
  const count = [deviceId, farmId, zoneId].filter(Boolean).length;
  if (count !== 1) {
    throw new BadRequestException(
      'Exactly one of deviceId, farmId, or zoneId must be provided',
    );
  }
}
```

### Step 6: Update ScheduleService.execute

Add zone handling:
```typescript
private async execute(schedule: DeviceSchedule, now: Date) {
  // ... existing code ...

  try {
    if (schedule.deviceId) {
      await this.syncService.sendCommandToDevice(
        schedule.deviceId, schedule.command, schedule.params,
      );
    } else if (schedule.zoneId) {
      // NEW: zone-level schedule
      const zone = await this.zoneRepo.findOne({
        where: { id: schedule.zoneId },
        relations: ['devices'],
      });
      if (zone) {
        for (const device of zone.devices) {
          try {
            await this.syncService.sendCommandToDevice(
              device.id, schedule.command, schedule.params,
            );
          } catch (err) {
            this.logger.warn(
              `Failed to send command to device ${device.id} for zone schedule ${schedule.id}: ${err.message}`,
            );
          }
        }
      }
    } else if (schedule.farmId) {
      // ... existing farm-level code ...
    }
  } catch (error) { ... }

  // ... rest of execute (lastExecutedAt, FCM) ...

  // FCM: resolve farmId from zone if needed
  const farmId =
    schedule.farmId ||
    (schedule.zoneId
      ? (await this.zoneRepo.findOne({ where: { id: schedule.zoneId } }))?.farmId
      : null) ||
    (schedule.deviceId
      ? (await this.deviceService.findOne(schedule.deviceId))?.farmId
      : null);
  // ... FCM code ...
}
```

### Step 7: Update ScheduleModule

Import `TypeOrmModule.forFeature([Zone])` for zone queries in execute.

### Step 8: Update ScheduleService.findAll

Add `zoneId` filter:
```typescript
async findAll(deviceId?: string, farmId?: string, zoneId?: string) {
  const where: any = {};
  if (deviceId) where.deviceId = deviceId;
  if (farmId) where.farmId = farmId;
  if (zoneId) where.zoneId = zoneId;
  // ...
}
```

### Step 9: Compile check

Run `yarn build`.

## Todo List

- [x] Add pump toggle method to ZoneService
- [x] Add pump toggle endpoint to ZoneController
- [x] Update ZoneModule imports (DeviceModule)
- [x] Update Schedule DTOs (zoneId)
- [x] Update ScheduleService.validateTarget (3-way XOR)
- [x] Update ScheduleService.execute (zone handling)
- [x] Update ScheduleService.findAll (zoneId filter)
- [x] Update ScheduleModule imports (Zone entity)
- [x] Run `yarn build` — verify no errors

## Success Criteria

- Zone pump toggle sends command to all devices in zone
- Zone pump toggle returns success/failure count
- Schedule can target zoneId
- Zone schedule execution sends to all zone devices
- FCM notifications work for zone schedules
- Existing device/farm schedules unaffected

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large zone (many devices) → slow pump toggle | Timeout | Promise.allSettled, parallel execution |
| Circular dep ZoneModule ↔ DeviceModule | Build failure | ZoneModule imports DeviceModule. DeviceModule uses TypeOrmModule.forFeature([Zone]) for zone queries (no ZoneModule import) |
| Schedule with zone deleted | Orphaned schedule | CASCADE delete on FK, or skip execution if zone not found |

## Security Considerations

- Pump toggle must verify user owns the farm that owns the zone
- Schedule zone assignment must verify zone belongs to user's farm
