# Phase 1: Implement Device Reset

## Overview

- **Priority:** P1
- **Status:** todo
- **Description:** Add transactional `cleanDeviceData()` to `DeviceService`, enhance `remove()`,
  and add `resetDevice()` + `POST /:id/reset` controller endpoint.

## Related Code Files

**Modify:**
- `src/device/device.module.ts`
- `src/device/device.service.ts`
- `src/device/device.controller.ts`

**Reference:**
- `src/sensor/entities/sensor-data.entity.ts`
- `src/sensor/entities/alert-log.entity.ts`
- `src/sensor/entities/command-log.entity.ts`
- `src/sensor/entities/sensor-config.entity.ts`
- `src/sensor/entities/sensor-threshold.entity.ts` — has `onDelete: CASCADE` on FK ✓
- `src/device/entities/pairing-token.entity.ts`
- `src/schedule/entities/device-schedule.entity.ts`
- `src/device/entities/device.entity.ts`

## Implementation Steps

### Step 1 — device.module.ts: add entity registrations

Add 5 entities + DeviceSchedule to `TypeOrmModule.forFeature`:
- SensorData, AlertLog, CommandLog, SensorConfig, PairingToken, DeviceSchedule

### Step 2 — device.service.ts: inject repos + DataSource

Add constructor params:
```
@InjectRepository(SensorData) private sensorDataRepo
@InjectRepository(AlertLog) private alertLogRepo
@InjectRepository(CommandLog) private commandLogRepo
@InjectRepository(SensorConfig) private sensorConfigRepo
@InjectRepository(PairingToken) private pairingTokenRepo
@InjectRepository(DeviceSchedule) private deviceScheduleRepo
private readonly dataSource: DataSource
```

### Step 3 — device.service.ts: add private cleanDeviceData()

```typescript
private async cleanDeviceData(deviceId: string, serial: string | null): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.delete(AlertLog, { deviceId });
    await manager.delete(CommandLog, { deviceId });
    await manager.delete(SensorData, { deviceId });
    await manager.delete(DeviceSchedule, { deviceId });
    await manager.delete(SensorConfig, { deviceId }); // cascades SensorThreshold
    if (serial) {
      await manager.delete(PairingToken, { serial });
    }
  });
}
```

`manager.delete()` issues raw SQL `DELETE WHERE` — efficient, no entity loading.
SensorThreshold auto-deleted by DB-level `onDelete: CASCADE` on FK ✓

### Step 4 — device.service.ts: enhance remove()

```typescript
async remove(id: string) {
  const device = await this.findOne(id);
  await this.cleanDeviceData(device.id, device.serial);
  return this.deviceRepository.remove(device);
}
```

### Step 5 — device.service.ts: add resetDevice()

```typescript
async resetDevice(id: string) {
  const device = await this.findOne(id);
  await this.cleanDeviceData(device.id, device.serial);
  await this.deviceRepository.update(id, {
    farmId: null,
    deviceToken: null,
    status: DeviceStatus.PENDING,
    pairedAt: null,
  });
  return this.deviceRepository.findOne({ where: { id } });
}
```

### Step 6 — device.controller.ts: add POST /:id/reset

```typescript
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Post(':id/reset')
async resetDevice(@Param('id') id: string) {
  return this.deviceService.resetDevice(id);
}
```

Place after `unpairDevice` endpoint.

## Todo List

- [ ] Add entity imports + forFeature registrations in `device.module.ts`
- [ ] Inject 6 repos + DataSource in `DeviceService` constructor
- [ ] Add import statements for new entities in `device.service.ts`
- [ ] Implement `cleanDeviceData(deviceId, serial)` private method
- [ ] Enhance `remove()` to call `cleanDeviceData()` first
- [ ] Implement `resetDevice()` method
- [ ] Add `POST /:id/reset` to `device.controller.ts`
- [ ] Run `yarn build` — verify no compile errors

## Success Criteria

- `DELETE /device/:id` removes device AND all related data (no orphaned rows)
- `POST /device/:id/reset` clears all data, returns device with `status: pending`, `deviceToken: null`, `farmId: null`
- After reset, device can be re-provisioned and re-paired as fresh
- Both operations wrapped in a DB transaction
- `yarn build` compiles cleanly
