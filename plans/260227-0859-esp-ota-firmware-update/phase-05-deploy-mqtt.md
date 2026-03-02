# Phase 5: Deploy to Devices via MQTT

**Priority:** High | **Effort:** Medium | **Status:** Pending

## Overview

Admin can select specific device(s) or an entire farm to push OTA update. Server sends `OTA_UPDATE` command via existing MQTT command infrastructure. Mobile clients receive real-time status updates.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 3: Publish & Notify](./phase-03-publish-websocket-notify.md)
- [Phase 4: Device Check & Download](./phase-04-device-check-download.md)
- Existing pattern: `src/device/sync/sync.service.ts` → `sendCommandToDevice()`

## Architecture

```
Admin POST /firmware/:id/deploy
  { deviceIds: ["id1","id2"] }    ← target specific devices
  OR { farmId: "farm-uuid" }      ← target all devices in farm

  │
  ├─ FirmwareService.deploy()
  │   ├─ Resolve target devices (by IDs or farmId)
  │   ├─ For each device:
  │   │   ├─ Create FirmwareUpdateLog (status: PENDING)
  │   │   └─ SyncService.sendCommandToDevice(deviceId, 'OTA_UPDATE', {
  │   │       version, downloadUrl, checksum, checksumAlgorithm, fileSize
  │   │     })
  │   └─ Return deploy summary
  │
  ├─ MQTT: device/{deviceId}/cmd
  │   { command: "OTA_UPDATE", data: { version, downloadUrl, checksum, ... } }
  │
  └─ WebSocket: broadcast 'firmwareDeploying' to device rooms
```

## Related Code Files

**Create:**
- `src/firmware/dto/deploy-firmware.dto.ts`

**Modify:**
- `src/firmware/firmware.controller.ts` — add deploy endpoint
- `src/firmware/firmware.service.ts` — add deploy logic

## Implementation Steps

### 1. Create `deploy-firmware.dto.ts`

```typescript
export class DeployFirmwareDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds?: string[];

  @IsOptional()
  @IsUUID()
  farmId?: string;

  // At least one of deviceIds or farmId must be provided
  // Validate in service layer
}
```

### 2. Add deploy endpoint

```typescript
@Post(':id/deploy')
@UseGuards(JwtAuthGuard)
async deploy(
  @Param('id') id: string,
  @Body() dto: DeployFirmwareDto,
) {
  return this.firmwareService.deploy(id, dto);
}
```

### 3. Implement deploy logic

```typescript
async deploy(firmwareId: string, dto: DeployFirmwareDto) {
  const firmware = await this.findOne(firmwareId);

  // Resolve target devices
  let devices: Device[];
  if (dto.farmId) {
    devices = await this.deviceService.findAll(dto.farmId);
  } else if (dto.deviceIds?.length) {
    devices = await Promise.all(
      dto.deviceIds.map(id => this.deviceService.findOne(id))
    );
  } else {
    throw new BadRequestException('Provide deviceIds or farmId');
  }

  // Filter only ACTIVE devices
  const activeDevices = devices.filter(d => d.status === DeviceStatus.ACTIVE);

  const results = [];

  for (const device of activeDevices) {
    // Create update log
    const log = await this.updateLogRepository.save(
      this.updateLogRepository.create({
        firmwareId: firmware.id,
        deviceId: device.id,
        previousVersion: device.firmwareVersion,
        status: FirmwareUpdateStatus.PENDING,
      })
    );

    // Send OTA command via MQTT
    try {
      await this.syncService.sendCommandToDevice(device.id, 'OTA_UPDATE', {
        version: firmware.version,
        downloadUrl: `/api/firmware/download/${firmware.id}`,
        checksum: firmware.checksum,
        checksumAlgorithm: 'md5',
        fileSize: firmware.fileSize,
      });

      results.push({ deviceId: device.id, logId: log.id, status: 'sent' });
    } catch (error) {
      log.status = FirmwareUpdateStatus.FAILED;
      log.errorMessage = error.message;
      await this.updateLogRepository.save(log);
      results.push({ deviceId: device.id, logId: log.id, status: 'failed', error: error.message });
    }
  }

  // Broadcast to WebSocket
  for (const device of activeDevices) {
    this.deviceGateway.broadcastDeviceStatus(device.id, {
      type: 'firmwareDeploying',
      firmwareVersion: firmware.version,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    firmwareId: firmware.id,
    version: firmware.version,
    totalTargeted: devices.length,
    totalActive: activeDevices.length,
    results,
  };
}
```

### 4. Get deploy status endpoint

```typescript
@Get(':id/deploy-status')
@UseGuards(JwtAuthGuard)
async getDeployStatus(@Param('id') firmwareId: string) {
  const logs = await this.firmwareService.getUpdateLogs(firmwareId);
  return {
    firmwareId,
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    failed: logs.filter(l => l.status === 'failed').length,
    pending: logs.filter(l => l.status === 'pending').length,
    logs,
  };
}
```

## MQTT Command Format

**Topic:** `device/{deviceId}/cmd`
**Payload:**
```json
{
  "command": "OTA_UPDATE",
  "data": {
    "version": "1.3.0",
    "downloadUrl": "/api/firmware/download/uuid-here",
    "checksum": "abc123def456...",
    "checksumAlgorithm": "md5",
    "fileSize": 632000
  },
  "timestamp": "2026-02-27T09:00:00Z"
}
```

## Todo

- [ ] Create `src/firmware/dto/deploy-firmware.dto.ts`
- [ ] Add `POST /firmware/:id/deploy` endpoint
- [ ] Implement `deploy()` in service (resolve devices, create logs, send MQTT commands)
- [ ] Add `GET /firmware/:id/deploy-status` endpoint
- [ ] Broadcast `firmwareDeploying` status via WebSocket
- [ ] Run `yarn build` to verify

## Success Criteria

- Deploy to specific devices → each receives `OTA_UPDATE` MQTT command
- Deploy to farm → all ACTIVE devices in farm receive command
- FirmwareUpdateLog created for each targeted device
- WebSocket clients see `firmwareDeploying` status per device
- Deploy status endpoint shows progress
