# Phase 6: Update Reporting & Logs

**Priority:** Medium | **Effort:** Small | **Status:** Pending

## Overview

Device reports OTA update result (success/failure) via REST endpoint or MQTT response. Server updates `FirmwareUpdateLog`, updates device's `firmwareVersion`, and notifies mobile clients.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 5: Deploy via MQTT](./phase-05-deploy-mqtt.md)
- Existing pattern: `src/device/sync/sync.service.ts` → `handleDeviceResponse()`

## Architecture

```
Path A: Device reports via MQTT response (preferred)
─────────────────────────────────────────────────────
device/{deviceId}/resp
  { command: "OTA_UPDATE", success: true, version: "1.3.0", duration: 45000, previousVersion: "1.2.0" }
  │
  └─ SyncService receives → emits 'firmware.update.reported'
     └─ FirmwareService listener:
        ├─ Update FirmwareUpdateLog (status: success/failed)
        ├─ Update Device.firmwareVersion
        └─ Broadcast 'firmwareUpdateStatus' via WebSocket

Path B: Device reports via REST (fallback)
──────────────────────────────────────────
POST /firmware/report
  { deviceId, version, status, error, duration }
  │
  └─ Same processing as Path A
```

## Related Code Files

**Create:**
- `src/firmware/dto/firmware-report.dto.ts`

**Modify:**
- `src/firmware/firmware.service.ts` — add report handler + event listener
- `src/firmware/firmware.controller.ts` — add report endpoint
- `src/device/sync/sync.service.ts` — detect OTA_UPDATE response and emit event

## Implementation Steps

### 1. Create `firmware-report.dto.ts`

```typescript
export class FirmwareReportDto {
  @IsUUID()
  deviceId: string;

  @IsString()
  version: string;

  @IsEnum(FirmwareUpdateStatus)
  status: FirmwareUpdateStatus;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsInt()
  duration?: number;  // ms

  @IsOptional()
  @IsString()
  previousVersion?: string;
}
```

### 2. Handle MQTT response in SyncService

In `handleDeviceResponse()`, detect OTA_UPDATE command:

```typescript
private handleDeviceResponse(message: MqttMessage) {
  const { deviceId, payload, timestamp } = message;

  // Existing broadcast logic...

  // Detect firmware update response
  if (payload.command === 'OTA_UPDATE') {
    this.eventEmitter.emit('firmware.update.reported', {
      deviceId,
      version: payload.version,
      success: payload.success,
      errorMessage: payload.error,
      duration: payload.duration,
      previousVersion: payload.previousVersion,
      timestamp,
    });
  }
}
```

### 3. Listen to event in FirmwareService

```typescript
@OnEvent('firmware.update.reported')
async handleUpdateReport(data: {
  deviceId: string;
  version: string;
  success: boolean;
  errorMessage?: string;
  duration?: number;
  previousVersion?: string;
}) {
  // Find the pending log for this device + version
  const log = await this.updateLogRepository.findOne({
    where: { deviceId: data.deviceId, status: FirmwareUpdateStatus.PENDING },
    order: { createdAt: 'DESC' },
  });

  if (log) {
    log.status = data.success ? FirmwareUpdateStatus.SUCCESS : FirmwareUpdateStatus.FAILED;
    log.errorMessage = data.errorMessage;
    log.duration = data.duration;
    log.reportedAt = new Date();
    await this.updateLogRepository.save(log);
  }

  // Update device firmware version on success
  if (data.success) {
    await this.deviceService.update(data.deviceId, {
      firmwareVersion: data.version,
    });
  }

  // Broadcast status to WebSocket
  this.deviceGateway.broadcastDeviceStatus(data.deviceId, {
    type: 'firmwareUpdateStatus',
    version: data.version,
    status: data.success ? 'success' : 'failed',
    errorMessage: data.errorMessage,
    duration: data.duration,
    timestamp: new Date().toISOString(),
  });
}
```

### 4. Add REST report endpoint (fallback for devices)

```typescript
@Post('report')
async report(@Body() dto: FirmwareReportDto) {
  return this.firmwareService.handleUpdateReport({
    deviceId: dto.deviceId,
    version: dto.version,
    success: dto.status === FirmwareUpdateStatus.SUCCESS,
    errorMessage: dto.errorMessage,
    duration: dto.duration,
    previousVersion: dto.previousVersion,
  });
}
```

No auth guard — device may report without JWT.

### 5. Add admin query endpoints for logs

```typescript
@Get('logs')
@UseGuards(JwtAuthGuard)
async getLogs(
  @Query('deviceId') deviceId?: string,
  @Query('firmwareId') firmwareId?: string,
) {
  return this.firmwareService.getUpdateLogs({ deviceId, firmwareId });
}
```

## WebSocket Event Format

**Event:** `firmwareUpdateStatus` (via `deviceStatus` room broadcast)
**Payload:**
```json
{
  "deviceId": "uuid",
  "status": {
    "type": "firmwareUpdateStatus",
    "version": "1.3.0",
    "status": "success",
    "duration": 45000,
    "timestamp": "2026-02-27T09:15:00Z"
  },
  "timestamp": "2026-02-27T09:15:00Z"
}
```

## Todo

- [ ] Create `src/firmware/dto/firmware-report.dto.ts`
- [ ] Add OTA_UPDATE detection in `SyncService.handleDeviceResponse()`
- [ ] Add `@OnEvent('firmware.update.reported')` listener in `FirmwareService`
- [ ] Update `FirmwareUpdateLog` and `Device.firmwareVersion` on success
- [ ] Broadcast `firmwareUpdateStatus` via WebSocket
- [ ] Add `POST /firmware/report` REST endpoint (no auth)
- [ ] Add `GET /firmware/logs` admin endpoint
- [ ] Run `yarn build` to verify

## Success Criteria

- Device MQTT response → log updated, device version updated, WebSocket notified
- Device REST report → same behavior as MQTT path
- Failed updates logged with error message
- Admin can query update logs by device or firmware version
