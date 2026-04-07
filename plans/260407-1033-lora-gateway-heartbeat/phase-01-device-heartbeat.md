# Phase 01 — Device lastSeenAt + Heartbeat Fix

## Overview

- **Priority:** P0 (bug fix — ship độc lập)
- **Status:** complete
- **Effort:** 2h

Fix `isDeviceOnline()` luôn trả về `true`. Thêm `lastSeenAt` vào Device entity, cập nhật qua telemetry + heartbeat message từ device.

## Key Insights

- `MqttService.isDeviceConnected()` hiện tại: `return this.client && this.client.connected` → check server MQTT client, không liên quan device cụ thể
- `GET /devices/:id/status` → `online: true` cho mọi device → **sai hoàn toàn**
- LWT chỉ push WebSocket real-time, không có persistent state
- Device gửi telemetry định kỳ → dùng làm implicit heartbeat
- Thêm explicit heartbeat 30s cho trường hợp device idle (không có sensor activity)

## Requirements

- `Device.lastSeenAt` cập nhật khi: nhận telemetry HOẶC heartbeat message
- `isDeviceOnline()` = `lastSeenAt < 90s ago` (missed 3 heartbeats → offline)
- LWT (`reason: "lwt"`) → set `lastSeenAt = null` ngay lập tức
- Heartbeat không broadcast WebSocket (tránh spam app)
- Throttle DB write: chỉ update `lastSeenAt` khi > 30s từ lần cập nhật trước

## Related Files

**Modify:**
- `src/device/entities/device.entity.ts` — thêm `lastSeenAt`
- `src/device/mqtt/mqtt.service.ts` — fix `isDeviceConnected()`
- `src/device/sync/sync.service.ts` — update `lastSeenAt` on telemetry + heartbeat
- `src/device/device.controller.ts` — `GET /:id/status` dùng `lastSeenAt`

## Implementation Steps

### 1. Thêm `lastSeenAt` vào Device entity

File: `src/device/entities/device.entity.ts`

```typescript
@Column({ type: 'timestamp', nullable: true })
lastSeenAt: Date;
```

Thêm sau `pairedAt`. TypeORM `synchronize: true` tự thêm column.

### 2. Fix `isDeviceConnected()` trong MqttService

File: `src/device/mqtt/mqtt.service.ts`

Xóa implementation cũ (chỉ check `this.client.connected`). Để `SyncService` hoặc `DeviceService` xử lý via `lastSeenAt`. Method này không cần nữa — xoá hoặc deprecate.

### 3. Cập nhật `lastSeenAt` trong SyncService

File: `src/device/sync/sync.service.ts`

**Trong `handleDeviceTelemetry()`** — thêm sau khi có `deviceId`:
```typescript
// Throttle: chỉ update nếu lastSeenAt > 30s cũ
const now = new Date();
await this.deviceRepository
  .createQueryBuilder()
  .update(Device)
  .set({ lastSeenAt: now })
  .where('id = :id AND (lastSeenAt IS NULL OR lastSeenAt < :threshold)', {
    id: deviceId,
    threshold: new Date(Date.now() - 30_000),
  })
  .execute();
```

**Trong `handleDeviceStatus()`** — phân nhánh:
```typescript
if (payload.type === 'heartbeat') {
  await this.deviceRepository.update(deviceId, { lastSeenAt: new Date() });
  return; // Không broadcast heartbeat
}

if (payload.reason === 'lwt') {
  await this.deviceRepository.update(deviceId, { lastSeenAt: null });
  // emit pump.disconnected như cũ...
}
// các status khác: broadcast bình thường
```

### 4. Fix `isDeviceOnline()` trong SyncService

```typescript
async isDeviceOnline(deviceId: string): Promise<boolean> {
  const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
  if (!device?.lastSeenAt) return false;
  return (Date.now() - device.lastSeenAt.getTime()) < 90_000;
}
```

### 5. Device Controller — không cần đổi

`GET /devices/:id/status` gọi `syncService.isDeviceOnline()` → tự fix sau bước 4.

### 6. Device Firmware (ESP32) — heartbeat

Device firmware gửi mỗi 30s:
```
Topic: device/{deviceId}/status
Payload: { "type": "heartbeat", "ts": <millis> }
```

> Với gateway/LoRa: heartbeat = LoRa STATUS frame (0x06), 5 bytes, gateway forward lên MQTT.

## Todo

- [x] Thêm `lastSeenAt: Date` vào `device.entity.ts`
- [x] Fix `isDeviceConnected()` trong `mqtt.service.ts`
- [x] Update `lastSeenAt` trong `handleDeviceTelemetry()` với throttle
- [x] Handle heartbeat + LWT trong `handleDeviceStatus()`
- [x] Fix `isDeviceOnline()` dùng `lastSeenAt`
- [x] Verify `GET /devices/:id/status` trả về đúng
- [x] Compile check: `yarn build`

## Success Criteria

- `GET /devices/:id/status` trả `online: false` khi device offline > 90s
- `GET /devices/:id/status` trả `online: true` khi device đang gửi telemetry/heartbeat
- Không có WebSocket spam từ heartbeat messages
- LWT set `lastSeenAt = null` → device báo offline ngay

## Risk

- DB write throttle logic: cần test kỹ với TypeORM QueryBuilder syntax
- Server restart: devices cần gửi heartbeat mới để cập nhật state (max 30s delay)
