# Phase 05 — Gateway + Device OTA

## Overview

- **Priority:** P2
- **Status:** complete
- **Effort:** 3h
- **Depends on:** Phase 04

Extend OTA để hỗ trợ gateway firmware update (admin trigger qua MQTT) và device OTA qua LoRa (gateway làm trung gian download + chunked transfer).

## Key Insights

- Gateway OTA: server publish `gateway/{gwId}/ota {url, checksum, version}` → gateway tự download HTTP + ESP32 OTA
- Device OTA qua LoRa: server → `gateway/{gwId}/device-ota` → gateway download binary → chunk 128B qua LoRa
- Reuse `Firmware` entity và `FirmwareService` hiện tại — thêm target type `GATEWAY`
- Trigger OTA qua WebSocket `requestFirmwareUpdate` — extend payload với `gatewayIds`
- `FirmwareUpdateLog` ghi lại kết quả cho cả gateway và device

## Firmware Entity Extension

Hiện tại `Firmware` entity có `type` hay không cần kiểm tra. Cần thêm target type để phân biệt firmware cho device vs gateway.

> Xem `src/firmware/entities/firmware.entity.ts` trước khi implement.

## Related Files

**Modify:**
- `src/firmware/firmware.service.ts` — thêm gateway OTA handler
- `src/device/websocket/device.gateway.ts` — extend `requestFirmwareUpdate` payload
- `src/firmware/entities/firmware.entity.ts` — thêm `targetType` enum nếu chưa có

**May Create:**
- `src/gateway/gateway-ota.service.ts` — nếu logic đủ phức tạp để tách

## OTA Flows

### Gateway OTA

```
Admin WebSocket: requestFirmwareUpdate { firmwareId, gatewayIds: ["gwId"] }
  → EventEmitter: firmware.update.requested { firmwareId, gatewayIds }
  → FirmwareService @OnEvent: detect gatewayIds → loop gateways
    → Lấy firmware URL + checksum từ DB
    → Publish: gateway/{gwId}/ota { url, checksum, version }
  → Gateway nhận MQTT:
    → Download binary qua HTTP từ server
    → ESP32 OTA (ghi vào OTA partition)
    → Reboot
  → Gateway boot với firmware mới:
    → Gửi heartbeat: gateway/{gwId}/status { type: "heartbeat", fw: "new_version" }
  → FirmwareService @OnEvent('firmware.update.reported') (nếu gateway report lại)
    → Tạo FirmwareUpdateLog record
```

### Device OTA qua LoRa

```
Admin WebSocket: requestFirmwareUpdate { firmwareId, deviceIds: ["devId"] }
  (flow hiện tại unchanged nếu device connect WiFi trực tiếp)

  Với device qua gateway:
  → FirmwareService detect device thuộc gateway → route qua gateway
  → Publish: gateway/{gwId}/device-ota { deviceId, url, checksum, version }
  → Gateway nhận MQTT:
    → Download binary từ server URL
    → Chunked LoRa transfer:
        for chunk in firmware:
          publish LoRa OTA_CHUNK {seq, data[128B]}
          wait ACK từ device (timeout + retry)
    → Device flash + reboot
    → Device gửi LoRa STATUS → gateway forward device/{deviceId}/resp { command: "OTA_UPDATE", success, version }
  → SyncService.handleDeviceResponse() detect OTA_UPDATE → emit firmware.update.reported
  → FirmwareService tạo FirmwareUpdateLog
```

## Implementation Steps

### 1. Kiểm tra và extend Firmware entity

Đọc `src/firmware/entities/firmware.entity.ts`. Nếu chưa có `targetType`:
```typescript
export enum FirmwareTargetType {
  DEVICE  = 'device',
  GATEWAY = 'gateway',
}

@Column({ type: 'enum', enum: FirmwareTargetType, default: FirmwareTargetType.DEVICE })
targetType: FirmwareTargetType;
```

### 2. Extend WebSocket payload

File: `src/device/websocket/device.gateway.ts`

```typescript
// requestFirmwareUpdate handler — thêm gatewayIds
data: { firmwareId: string; deviceIds?: string[]; farmId?: string; gatewayIds?: string[] }

this.eventEmitter.emit('firmware.update.requested', {
  firmwareId: data.firmwareId,
  deviceIds:  data.deviceIds,
  farmId:     data.farmId,
  gatewayIds: data.gatewayIds,  // MỚI
  userId,
  socketId: client.id,
});
```

### 3. Extend FirmwareService

File: `src/firmware/firmware.service.ts`

Trong `@OnEvent('firmware.update.requested')`:
```typescript
async handleMobileUpdateRequest(data) {
  // Gateway OTA (xử lý trước)
  if (data.gatewayIds?.length) {
    await this.deployToGateways(data.firmwareId, data.gatewayIds);
    return;
  }

  // Device OTA — flow hiện tại giữ nguyên
  // ...existing code...
}

private async deployToGateways(firmwareId: string, gatewayIds: string[]) {
  const firmware = await this.firmwareRepository.findOne({ where: { id: firmwareId } });
  if (!firmware) return;

  for (const gwId of gatewayIds) {
    await this.mqttService.publishToTopic(`gateway/${gwId}/ota`, {
      url:      `${process.env.SERVER_URL}/files/${firmware.filename}`,
      checksum: firmware.checksum,
      version:  firmware.version,
      ts:       new Date().toISOString(),
    });

    // Log
    await this.firmwareUpdateLogRepository.save({
      firmwareId,
      deviceId: null,
      gatewayId: gwId,
      status: 'pending',
      triggeredAt: new Date(),
    });
  }
}
```

### 4. FirmwareUpdateLog — thêm `gatewayId`

Kiểm tra `src/firmware/entities/firmware-update-log.entity.ts`. Nếu chỉ có `deviceId`, thêm:
```typescript
@Column('uuid', { nullable: true })
gatewayId: string;
```

### 5. Gateway report OTA result (optional)

Gateway sau khi OTA xong gửi heartbeat với `fw: "new_version"`. `GatewayService.handleGatewayStatus()` (Phase 04) đã cập nhật `firmwareVersion` từ heartbeat. Đủ để biết OTA thành công.

Nếu cần explicit OTA result: gateway publish `gateway/{gwId}/status { type: "ota_result", version, success }` → handle trong `handleGatewayStatus()`.

### 6. Device OTA qua Gateway — routing

Vấn đề: làm sao biết device X đang kết nối qua gateway hay WiFi trực tiếp?

Giải pháp đơn giản: thêm `gatewayId` vào `Device` entity (nullable). Set khi device provision qua gateway.

```typescript
// Device entity
@Column('uuid', { nullable: true })
gatewayId: string;
```

Khi `FirmwareService` deploy cho device có `gatewayId`:
```typescript
const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
if (device.gatewayId) {
  // Route qua gateway
  await this.mqttService.publishToTopic(`gateway/${device.gatewayId}/device-ota`, {
    deviceId, url, checksum, version
  });
} else {
  // Direct WiFi OTA — flow hiện tại
  await this.mqttService.publishToDevice(deviceId, { cmd: 'OTA_UPDATE', ... });
}
```

## Todo

- [x] Đọc `firmware.entity.ts` + `firmware-update-log.entity.ts` — kiểm tra cần extend gì
- [x] Thêm `targetType` vào Firmware entity nếu chưa có
- [x] Thêm `gatewayId` vào FirmwareUpdateLog entity
- [x] Thêm `gatewayId` vào Device entity (nullable — set lúc provision qua gateway)
- [x] Extend WebSocket `requestFirmwareUpdate` payload với `gatewayIds`
- [x] `deployToGateways()` trong FirmwareService
- [x] Routing logic: device với `gatewayId` → `device-ota` topic
- [x] Compile check: `yarn build`

## Success Criteria

- Admin trigger `requestFirmwareUpdate { gatewayIds: ["gwId"] }` → MQTT `gateway/{gwId}/ota` được publish
- Gateway reconnect sau OTA → `firmwareVersion` cập nhật trong DB qua heartbeat
- Device có `gatewayId` set → OTA command route qua `gateway/{gwId}/device-ota`
- Device không có `gatewayId` → OTA flow hiện tại giữ nguyên

## Risk

- Chunked LoRa OTA (firmware ESP32) là phần phức tạp nhất — nằm ở gateway firmware, không phải server. Server chỉ cần publish trigger và URL.
- `FirmwareUpdateLog` cần biết kết quả OTA của gateway — dựa vào heartbeat `fw` field thay vì explicit report (đủ cho MVP).
- Device `gatewayId` field: cần được set trong `ProvisionService` khi gateway forward provision request. Cần pass `gatewayId` theo cùng provision payload — gateway thêm `gwId` vào message khi forward `provision/new`.
