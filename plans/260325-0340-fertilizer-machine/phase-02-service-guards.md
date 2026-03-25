# Phase 02 — Service Guards

## Context Links
- SyncService: `src/device/sync/sync.service.ts` (line 263: `sendCommandToDevice`)
- ScheduleService: `src/schedule/schedule.service.ts` (line 236: `execute`)
- DeviceService: `src/device/device.service.ts`

## Overview
- **Priority:** P1
- **Status:** Completed
- **Blocked by:** Phase 01
- **Description:** Add `hasFertilizer` guard in SyncService and ScheduleService to skip fertilizer commands when feature is disabled.

## Key Insights
- `SyncService.sendCommandToDevice()` is the single dispatch point for ALL commands (manual + scheduled)
- `ScheduleService.execute()` calls `syncService.sendCommandToDevice()` — guard at SyncService level covers both
- Best to guard in **SyncService only** (DRY) — ScheduleService goes through it anyway
- `DeviceService` already has `findOne(id)` — use it to fetch device with `hasFertilizer`
- Fertilizer commands prefix: `fertilizer_` (e.g., `fertilizer_on`, `fertilizer_off`)

## Requirements
- When `hasFertilizer = false`: throw `BadRequestException` for any command starting with `fertilizer_`
- Guard must not impact non-fertilizer commands (pump, irrigation, etc.)
- Fertilizer `fertilizerEnabled` state update: handled via existing `updateDevice` endpoint (no new endpoint)

## Architecture

```
Mobile App / ScheduleService
        │
        ▼
SyncService.sendCommandToDevice(deviceId, command, params)
        │
        ├─ [command starts with 'fertilizer_']
        │       │
        │       ├─ fetch device (already fetched via getDeviceIds)
        │       ├─ device.hasFertilizer = false → throw BadRequestException
        │       └─ device.hasFertilizer = true → proceed
        │
        └─ [other commands] → proceed as-is
        │
        ▼
mqttService.publishToDevice(...)
```

## Related Code Files
- **Modify:** `src/device/sync/sync.service.ts` (2 places: `sendCommandToDevice` + `handleDeviceResponse`)

## Implementation Steps

### Step 1: Read current SyncService structure

Current `sendCommandToDevice` at line 263:
```typescript
async sendCommandToDevice(deviceId: string, command: string, params: any) {
  this.logger.log(`Sending command to device ${deviceId}: ${command}`);
  const { farmId } = await this.getDeviceIds(deviceId);
  // ... publish + emit
}
```

`getDeviceIds` fetches device from DB. Check if it returns the full Device object or just IDs.

### Step 2: Check getDeviceIds implementation

Read `src/device/sync/sync.service.ts` to see what `getDeviceIds` returns. If it returns the full Device, reuse it. If not, fetch device separately only when command is a fertilizer command.

### Step 3: Add fertilizer guard

**Option A (if getDeviceIds returns full Device):**
```typescript
async sendCommandToDevice(deviceId: string, command: string, params: any) {
  const { farmId, device } = await this.getDeviceIds(deviceId);

  if (command.startsWith('fertilizer_') && !device.hasFertilizer) {
    throw new BadRequestException(
      `Device ${deviceId} does not have a fertilizer machine`,
    );
  }
  // ... rest unchanged
}
```

**Option B (if getDeviceIds only returns IDs — lazy fetch):**
```typescript
async sendCommandToDevice(deviceId: string, command: string, params: any) {
  const { farmId } = await this.getDeviceIds(deviceId);

  if (command.startsWith('fertilizer_')) {
    const device = await this.deviceService.findOne(deviceId);
    if (!device.hasFertilizer) {
      throw new BadRequestException(
        `Device ${deviceId} does not have a fertilizer machine`,
      );
    }
  }
  // ... rest unchanged
}
```

→ Read `getDeviceIds` first, then choose the cleaner option.

### Step 4: Sync fertilizerEnabled from MQTT response

In `handleDeviceResponse` (line 200), after the existing `PUMP_ON/PUMP_OFF` block (line 241), add:

```typescript
// Update device fertilizerEnabled state on FERTILIZER_ON/FERTILIZER_OFF feedback
if (
  (payload.command === 'FERTILIZER_ON' || payload.command === 'FERTILIZER_OFF') &&
  payload.success
) {
  const fertilizerEnabled = payload.command === 'FERTILIZER_ON';
  await this.deviceRepo.update(deviceId, { fertilizerEnabled });
  this.logger.log(
    `Device ${deviceId} fertilizerEnabled updated to ${fertilizerEnabled}`,
  );

  // Notify mobile of state change
  this.deviceGateway.broadcastDeviceStatus(
    deviceId,
    {
      type: 'fertilizerStateChanged',
      fertilizerEnabled,
      command: payload.command,
      timestamp: new Date().toISOString(),
    },
    farmId,
  );
}
```

### Step 5: Run compile check

```bash
yarn build
```

## Todo List

- [x] Read `getDeviceIds` in SyncService to determine what it returns
- [x] Add fertilizer guard in `sendCommandToDevice` (after `getDeviceIds` call, before `mqttService.publish`)
- [x] Ensure `DeviceService` is injectable in SyncService (check constructor) or reuse existing fetch
- [x] Add `FERTILIZER_ON/FERTILIZER_OFF` handler in `handleDeviceResponse` (after PUMP block, line 241)
- [x] Broadcast `fertilizerStateChanged` to WebSocket clients
- [x] Run `yarn build` to verify no compile errors

## Success Criteria
- Sending `fertilizer_on` to device with `hasFertilizer=false` returns 400 BadRequestException
- Sending `fertilizer_on` to device with `hasFertilizer=true` proceeds normally via MQTT
- Pump commands (`pump_on`, etc.) unaffected by the guard

## Risk Assessment
- **Low:** Guard is a simple prefix check + boolean field read
- **Medium:** If `getDeviceIds` does not return Device object, need extra DB fetch per fertilizer command — acceptable since fertilizer commands are infrequent

## Security Considerations
- Guard prevents command injection for non-configured hardware
- No new permissions needed; existing JWT auth covers the endpoint

## Next Steps
- Phase 3: Write unit tests for guard behavior
