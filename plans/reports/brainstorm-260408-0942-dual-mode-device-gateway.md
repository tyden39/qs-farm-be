# Brainstorm: Dual-Mode Device (WiFi + LoRa Gateway Fallback)

**Date:** 2026-04-08
**Status:** Approved (revised)

## Problem Statement

Current gateway-device provision flow requires full device provision ceremony even when device connects through gateway. Need to simplify while maintaining security — device must always authenticate via standard MQTT provision/pair flow. Gateway serves as fallback LoRa transport, not registration authority.

## Approved Design

### Device Operation Priority
1. **WiFi** → MQTT direct (standalone mode)
2. **LoRa** → through Gateway (fallback)
3. **Offline** → pause data sending

### Constraints
- 1 farm = max 1 gateway
- All devices must provision/pair via standard MQTT flow (security)
- Gateway cannot register devices (prevent stealing neighbor's devices)
- Device always has `deviceToken` (can connect directly anytime)

### Auto-assign Logic (bidirectional)

**When device paired** (`pairDevice()`):
- Find farm's gateway → if exists, set `device.gatewayId`
- If no gateway → `gatewayId = null`
- Include `gatewayId` in `set_owner` MQTT command payload

**When gateway paired** (`pairGateway()`):
- Find all devices in farm → bulk set `gatewayId` for all of them
- No `set_mode` command — firmware selects LoRa/WiFi autonomously

**When gateway unpaired/deleted**:
- Bulk set `gatewayId = null` for all devices pointing to it

### Code Changes Required

#### 1. `ProvisionService.pairDevice()` — auto-assign gateway
After pair: query farm gateway → set `device.gatewayId`. Include `gatewayId` in `set_owner` command.

#### 2. `GatewayService.pairGateway()` — auto-assign all farm devices
After pair: find all devices in farm → bulk update `gatewayId`. No `set_mode` command.

#### 2b. `GatewayService` — unpair/delete gateway
On gateway delete/unpair: bulk `UPDATE device SET gatewayId = null WHERE gatewayId = {id}`.

#### 3. `EmqxService.authenticate()` — remove direct connect block
Remove `if (device.gatewayId)` block. Devices always allowed with valid `deviceToken`.

#### 4. `EmqxService.checkGatewayAcl()` — cleanup
Remove:
- `provision/new` publish
- `provision/resp/+` subscribe
- `gateway/{gwId}/devices/report` publish

Keep:
- `device/{owned}/*` pub (LoRa telemetry proxy)
- `device/+/cmd` sub (command forwarding)
- `gateway/{self}/status` (heartbeat)
- `gateway/{self}/ota`, `gateway/{self}/device-ota` sub (OTA updates)

#### 5. Remove `GatewayService.handleDevicesReported()`
Gateway no longer detects/reports devices. Remove:
- `handleDevicesReported()` method + `@OnEvent('gateway.devices.reported')`
- MQTT subscription for `gateway/+/devices/report` in mqtt.service.ts
- Event emission in mqtt.service.ts message handler

#### 6. Remove manual device assignment endpoints
Remove `POST /gateways/:id/devices` (`assignDevices`) and `DELETE /gateways/:id/devices` (`unassignDevices`). Auto-assign at pair time replaces manual management.

#### 7. `FirmwareService.deploy()` — dual-channel OTA for gateway devices
Current: routes OTA based on `gatewayId` (either WiFi or LoRa, not both).
Problem: device with `gatewayId` may be on WiFi — sending only via gateway is wrong.

**Solution: send OTA via both channels when device has gateway. Unified payload format.**

Unified OTA payload (used on both channels):
```typescript
const otaPayload = {
  deviceId: device.id,       // gateway uses this for routing; device can ignore
  version: firmware.version,
  url: `/api/firmware/download/${firmware.id}`,
  checksum: firmware.checksum,
  checksumAlgorithm: 'md5',
  fileSize: firmware.fileSize,
  ts: new Date().toISOString(),
};
```

Dispatch logic:
```
if (device.gatewayId) {
  sendCommandToDevice(device.id, 'OTA_UPDATE', otaPayload);                       // WiFi
  publishToTopic(`gateway/${device.gatewayId}/device-ota`, otaPayload);           // LoRa
} else {
  sendCommandToDevice(device.id, 'OTA_UPDATE', otaPayload);                       // WiFi only
}
```
Firmware idempotent via version check — ignores duplicate OTA for same version.

### ACL Matrix (post-change)

| Actor | Topic | Pub | Sub |
|---|---|---|---|
| Device | `device/{self}/*` | Y | Y |
| Gateway | `device/{owned}/*` | Y | - |
| Gateway | `device/+/cmd` | - | Y |
| Gateway | `gateway/{self}/status` | Y | - |
| Gateway | `gateway/{self}/ota` | - | Y |
| Gateway | `gateway/{self}/device-ota` | - | Y |
| Gateway | ~~`provision/new`~~ | - | - |
| Gateway | ~~`provision/resp/+`~~ | - | - |
| Gateway | ~~`gateway/{self}/devices/report`~~ | - | - |

### Key Insight: No SyncService/SensorService Changes
Both WiFi and LoRa publish to same `device/{id}/telemetry` topic. Backend processes identically regardless of who published (device or gateway). Mutual exclusion at firmware level.

### Risks
- **WiFi↔LoRa race**: firmware must disable LoRa send when WiFi active
- **Farm has multiple gateways**: prevented by 1-farm-1-gateway constraint (service-level check in `pairGateway()`)
- **Device firmware needs gatewayId**: included in `set_owner` command payload
- **Duplicate OTA messages**: firmware idempotent by version — no side effect
- **Stale gatewayId on gateway delete**: handled by bulk null on unpair/delete

### Resolved
- **E.** `provision/gateway/new` publish in `checkGatewayAcl()` — **keep** (needed for gateway self-provisioning flow)
