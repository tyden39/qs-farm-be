# Schedule Flow

Mô tả luồng hoạt động của hệ thống schedule: từ tạo schedule qua API, đến engine tự động thực thi, dispatch command qua MQTT, và notify mobile qua WebSocket.

---

## Tổng quan

```
Mobile App ──REST──▶ API (ScheduleController)
                          │
                          ▼
                   DeviceSchedule (DB)
                          │
              [every 60s] │ @Interval
                          ▼
                   ScheduleService.processSchedules()
                          │
                ┌─────────┴──────────────┐
                │ deviceId OR zoneId     │ farmId
                │                        │
                ▼                        ▼
        SyncService.sendCommandToDevice()
                │
        ┌───────┴───────────────┐
        │                       │
        ▼                       ▼
  MQTT publish             WS broadcast
device/{id}/cmd        room: device:{id}
                       event: deviceStatus
                       { type: 'commandSent' }
                              │
                       Device executes
                              │
                              ▼
                  MQTT: device/{id}/resp
                              │
                              ▼
                  WS broadcast { type: 'commandResponse' }
```

---

## 1. CRUD Schedule (REST API)

Auth: `Bearer <accessToken>`

### Tạo schedule

```
POST /schedule
Content-Type: application/json

{
  "name": "Morning Irrigation",
  "type": "recurring",            // "recurring" | "one_time"
  "deviceId": "uuid",             // chỉ 1 trong 3: deviceId | zoneId | farmId
  "command": "PUMP_ON",
  "params": {},
  "daysOfWeek": [1, 3, 5],       // 0=Sun..6=Sat (chỉ recurring)
  "time": "06:00",               // HH:mm (chỉ recurring)
  "timezone": "Asia/Ho_Chi_Minh"
}

// one_time thay bằng:
{
  "type": "one_time",
  "executeAt": "2026-03-27T06:00:00.000Z"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "name": "Morning Irrigation",
  "type": "recurring",
  "deviceId": "uuid",
  "command": "PUMP_ON",
  "params": {},
  "daysOfWeek": [1, 3, 5],
  "time": "06:00",
  "timezone": "Asia/Ho_Chi_Minh",
  "enabled": true,
  "lastExecutedAt": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Các endpoint khác

| Method | Path | Mô tả |
|--------|------|-------|
| `GET /schedule` | `?deviceId=` / `?zoneId=` / `?farmId=` | Lấy danh sách |
| `GET /schedule/:id` | | Lấy 1 schedule |
| `PATCH /schedule/:id` | body partial DTO | Cập nhật |
| `DELETE /schedule/:id` | | Xóa |
| `PATCH /schedule/:id/toggle` | | Bật/tắt `enabled` |

---

## 2. Execution Engine

`@Interval(60_000)` — chạy mỗi 60 giây, có mutex `executing` để chống chạy đồng thời.

### shouldExecute logic

**one_time:**
```
executeAt <= now AND lastExecutedAt == null
```

**recurring:**
```
localTime(now, timezone).dayOfWeek ∈ daysOfWeek
AND localTime.hours == schedHour
AND localTime.minutes == schedMinute
AND NOT (đã chạy trong phút này rồi)
```

---

## 3. Luồng Device Schedule

Target: `deviceId` — gửi lệnh thẳng tới 1 device.

```
ScheduleService
  └─▶ SyncService.sendCommandToDevice(deviceId, command, params)
        │
        ├─▶ MQTT publish: device/{deviceId}/cmd
        │     { command: "PUMP_ON", params: {}, timestamp }
        │
        ├─▶ WS broadcast → room: device:{deviceId}
        │     event: deviceStatus
        │     { type: "commandSent", command, timestamp }
        │
        └─▶ EventEmitter.emit("command.dispatched", { deviceId, command, params, success: true })
              └─▶ SensorService logs CommandLog (source: MANUAL)
```

**Device phản hồi** (topic `device/{deviceId}/resp`):

| Command | Payload từ device | Side effect |
|---------|-------------------|-------------|
| `PUMP_ON` / `PUMP_OFF` | `{ command, success }` | DB: `device.pumpEnabled`; WS: `pumpStateChanged` |
| `FERTILIZER_ON` / `FERTILIZER_OFF` | `{ command, success }` | DB: `device.fertilizerEnabled`; WS: `fertilizerStateChanged` |
| `SET_IRRIGATION_MODE` / `SET_MODE` | `{ command, success, mode, irrigationMode }` | DB: `device.irrigationMode`; EventEmitter: `device.mode.changed` |
| `OTA_UPDATE` | `{ command, success, version, previousVersion, duration, error }` | EventEmitter: `firmware.update.reported` |
| Mọi command | `{ command, success, receivedAt }` | WS: `commandResponse` broadcast |

> `mode` và `irrigationMode` là alias — device có thể gửi 1 trong 2 hoặc cả 2, server lấy `mode ?? irrigationMode`.
> Giá trị hợp lệ: `"normal"` \| `"spray"` \| `"root"` \| `"drip"` (xem `IrrigationMode` enum).

```
Device ──MQTT──▶ device/{deviceId}/resp
  { command, success, [...fields tùy command] }
        │
        ▼
SyncService.handleDeviceResponse()
  ├─▶ WS broadcast → room: device:{deviceId}
  │     event: deviceStatus
  │     { type: "commandResponse", command, success, receivedAt }
  │
  ├─▶ (PUMP_ON/PUMP_OFF + success)
  │     DB: device.pumpEnabled = true/false
  │     WS: { type: "pumpStateChanged", pumpEnabled, command }
  │
  ├─▶ (FERTILIZER_ON/FERTILIZER_OFF + success)
  │     DB: device.fertilizerEnabled = true/false
  │     WS: { type: "fertilizerStateChanged", fertilizerEnabled, command }
  │
  ├─▶ (SET_IRRIGATION_MODE / SET_MODE + success)
  │     DB: device.irrigationMode = <IrrigationMode>
  │     EventEmitter.emit("device.mode.changed", { deviceId, irrigationMode })
  │
  └─▶ (OTA_UPDATE)
        EventEmitter.emit("firmware.update.reported", { deviceId, version,
          previousVersion, success, errorMessage, duration })
```

---

## 4. Luồng Zone Schedule

Target: `zoneId` — gửi lệnh tới **tất cả device trong zone**.

```
ScheduleService
  └─▶ DB query: zone với relations=['devices']
        │
        └─▶ for each device in zone.devices:
              SyncService.sendCommandToDevice(device.id, command, params)
                │
                ├─▶ MQTT publish: device/{device.id}/cmd
                │     { command, params, timestamp }
                │
                ├─▶ WS broadcast → room: device:{device.id}
                │     { type: "commandSent", command, timestamp }
                │
                └─▶ EventEmitter.emit("command.dispatched", ...)
```

> Lỗi tại 1 device chỉ log warn, không dừng các device còn lại.

**Device phản hồi:** tương tự Device Schedule (mỗi device reply riêng lẻ qua `device/{id}/resp`).

---

## 5. applyModeChange (SET_IRRIGATION_MODE / SET_MODE)

Khi command là `SET_IRRIGATION_MODE` hoặc `SET_MODE`, sau khi dispatch xong:

```
applyModeChange(schedule)
  │
  ├─ zoneId  → DB update zone.irrigationMode
  │            configResolution.invalidateCacheByZone(zoneId)
  │
  ├─ deviceId → DB update device.irrigationMode
  │             configResolution.invalidateCache(deviceId)
  │
  └─ farmId  → DB update tất cả device.irrigationMode trong farm
               configResolution.invalidateCache(từng deviceId)
```

> Mục đích: sensor threshold evaluation kỳ tiếp theo dùng đúng profile mới.

---

## 6. Post-Execution

Sau mỗi lần execute thành công:

```
schedule.lastExecutedAt = now
if (type === ONE_TIME) → schedule.enabled = false
DB save schedule
```

**FCM notification** (chỉ khi user offline):
```
isUserConnected(farmOwnerId) == false
  └─▶ FcmService.sendToFarmOwner(farmId, {
        title: "Schedule: {name}",
        body: 'Command "{command}" executed',
        data: { type: "SCHEDULE_EXECUTED", scheduleId, command }
      })
```

farmId được resolve theo thứ tự: `schedule.farmId` → `zone.farmId` → `device.farmId`.

---

## 7. MQTT Topics tổng hợp

| Topic | Chiều | Mô tả |
|-------|-------|-------|
| `device/{id}/cmd` | Server → Device | Gửi command |
| `device/{id}/resp` | Device → Server | Phản hồi command |
| `device/{id}/telemetry` | Device → Server | Dữ liệu cảm biến |
| `device/{id}/status` | Device → Server | Trạng thái thiết bị |

---

## 8. WebSocket Events tổng hợp

Client join room `device:{deviceId}` để nhận events.

| Event | Payload `type` | Trigger |
|-------|---------------|---------|
| `deviceStatus` | `commandSent` | Sau khi MQTT publish thành công |
| `deviceStatus` | `commandFailed` | MQTT publish thất bại |
| `deviceStatus` | `commandResponse` | Device reply qua MQTT |
| `deviceStatus` | `pumpStateChanged` | PUMP_ON/OFF confirmed |
| `deviceStatus` | `fertilizerStateChanged` | FERTILIZER_ON/OFF confirmed |

---

## 9. Enum Modes

### IrrigationMode — chế độ tưới

Dùng trong: `device.irrigationMode`, `zone.irrigationMode`, `SensorThreshold.irrigationMode`, `ZoneThreshold.irrigationMode`.
Khi schedule gửi `SET_IRRIGATION_MODE` / `SET_MODE`, giá trị `params.mode` hoặc `params.irrigationMode` phải là một trong:

| Value | Mô tả |
|-------|-------|
| `"normal"` | Tưới thông thường |
| `"spray"` | Tưới phun sương |
| `"root"` | Tưới nhỏ giọt gốc |
| `"drip"` | Tưới nhỏ giọt (drip tape) |

> Threshold evaluation dùng `irrigationMode` để chọn đúng threshold profile. Sau khi schedule `SET_IRRIGATION_MODE` chạy, `applyModeChange()` cập nhật DB và invalidate cache để kỳ telemetry tiếp theo dùng profile mới.

### ControlMode — chế độ điều khiển

Dùng trong: `device.controlMode`, `zone.controlMode` — **không** xuất hiện trong command `SET_IRRIGATION_MODE`.

| Value | Mô tả |
|-------|-------|
| `"auto"` | Tự động theo threshold |
| `"manual"` | Điều khiển thủ công |
| `"schedule"` | Điều khiển theo lịch |

> `controlMode` xuất hiện trong telemetry (`payload.controlMode`, `payload.fertControlMode`) để ghi vào pump/fertilizer session, không phải trong response của `SET_IRRIGATION_MODE`.

---

## 10. Constraint & Validation

- `deviceId`, `zoneId`, `farmId`: **chính xác 1 trong 3** phải có giá trị
- `recurring`: bắt buộc `daysOfWeek` (≥1 phần tử) và `time` (HH:mm)
- `one_time`: bắt buộc `executeAt` (ISO 8601)
- Mutation engine có guard `executing = true` tránh overlap
- Recurring: chống chạy trùng bằng so sánh `lastExecutedAt` cùng phút
