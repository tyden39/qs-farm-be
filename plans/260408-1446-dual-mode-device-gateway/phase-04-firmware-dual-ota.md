# Phase 04 — Firmware Dual-Channel OTA

**Status:** pending
**Priority:** medium

## Overview

Replace mutually-exclusive OTA routing with dual-channel dispatch (WiFi + LoRa simultaneously) when device has a gateway. Unify payload format across both channels.

## Context Links

- `src/firmware/firmware.service.ts` — `deploy()` (line 189), OTA dispatch block (line ~228)

## Current vs Target

**Current (exclusive routing):**
```typescript
if ((device as any).gatewayId) {
  // LoRa only — WRONG if device is on WiFi
  publishToTopic(`gateway/${gatewayId}/device-ota`, { deviceId, url, checksum, version, ts });
} else {
  sendCommandToDevice(device.id, 'OTA_UPDATE', { version, downloadUrl, checksum, checksumAlgorithm, fileSize });
}
```

**Target (dual-channel, unified payload):**
```typescript
const otaPayload = {
  deviceId: device.id,
  version: firmware.version,
  url: `/api/firmware/download/${firmware.id}`,
  checksum: firmware.checksum,
  checksumAlgorithm: 'md5',
  fileSize: firmware.fileSize,
  ts: new Date().toISOString(),
};

if (device.gatewayId) {
  // Both channels — firmware picks whichever arrives first, ignores duplicate via version check
  await this.syncService.sendCommandToDevice(device.id, 'OTA_UPDATE', otaPayload);
  await this.mqttService.publishToTopic(`gateway/${device.gatewayId}/device-ota`, otaPayload);
} else {
  await this.syncService.sendCommandToDevice(device.id, 'OTA_UPDATE', otaPayload);
}
```

## Implementation Steps

### 1. Define unified payload object

Extract common fields into `otaPayload` const before the dispatch block. Fields:
- `deviceId` — gateway uses for routing; device can ignore
- `version` — firmware version string
- `url` — download path (`/api/firmware/download/${firmware.id}`)
- `checksum` — md5 hex
- `checksumAlgorithm` — `'md5'`
- `fileSize` — bytes
- `ts` — ISO timestamp

### 2. Replace dispatch block

Replace the `if/else` with dual-send when `gatewayId` present. Both `await` calls inside `try` block, errors handled as before (update log status to FAILED).

### 3. Cast cleanup

Remove `(device as any).gatewayId` cast — verify `gatewayId` is typed on the device entity/DTO returned by `deviceService.findOne()`. If not typed, add proper typing rather than `any` cast.

## Related Code Files

**Modify:**
- `src/firmware/firmware.service.ts`

## Todo

- [ ] Define `otaPayload` unified const
- [ ] Replace exclusive if/else with dual-channel dispatch
- [ ] Remove `(device as any)` cast, ensure `gatewayId` is typed
- [ ] Compile check: `yarn build`

## Success Criteria

- Device with `gatewayId` → OTA sent to both `device/{id}/cmd` (WiFi) and `gateway/{gwId}/device-ota` (LoRa)
- Device without `gatewayId` → OTA sent only to `device/{id}/cmd`
- Both channels receive identical payload structure
- No `any` cast for `gatewayId` access
