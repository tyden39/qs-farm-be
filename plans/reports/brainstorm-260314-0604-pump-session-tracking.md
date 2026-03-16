# Brainstorm: Pump Session Tracking & Operating Life

**Date:** 2026-03-14
**Status:** Agreed (Updated 2026-03-16)

---

## Problem Statement

1. Khi bật/tắt máy bơm, cần tracking: thời gian hoạt động, số lần bật/tắt (cycle count), kèm biên độ sensor (nhiệt độ, áp suất, lưu lượng, dòng điện, số pha), phát hiện quá dòng. Hỗ trợ xuất Excel.
2. Mỗi device có thể cấu hình thời gian hoạt động tối đa (vd: 200h). Report trả về flag bảo trì khi tổng giờ hoạt động đạt ngưỡng.
3. Report API cần timeline grouping theo granularity tự động + summary đầy đủ.
4. Hỗ trợ MQTT LWT để đóng session khi ESP bị ngắt đột ngột.

---

## Approached Evaluated

### Option A: Derive từ CommandLog + SensorData (Rejected)
- Không tạo entity mới, tính toán on-the-fly khi query report
- **Cons:** Query chậm (join nhiều bảng), CommandLog không đảm bảo pairing clean (disconnect, crash), không scale tốt

### Option B: PumpSession Entity (Chosen)
- Entity riêng lưu aggregate data ngay khi session kết thúc
- Report query đơn giản, không join SensorData mỗi lần
- Clean separation of concerns

---

## Final Design

### 1. New SensorType: `PUMP_STATUS`

ESP gửi telemetry `{sensorType: 'PUMP_STATUS', value: 1}` khi bơm chạy, `value: 0` khi dừng.
**KHÔNG lưu PUMP_STATUS vào SensorData** — chỉ dùng để trigger events (YAGNI).

Open session handling: ESP tự re-send trạng thái khi reconnect → backend tiếp tục session cũ.

---

### 2. Entity: `PumpSession`

```typescript
// src/pump/entities/pump-session.entity.ts
PumpSession {
  id: UUID
  deviceId: FK → Device
  sessionNumber: number        // cycle count tăng dần per device

  startedAt: timestamp
  endedAt: timestamp | null    // null = đang chạy
  durationSeconds: number | null

  // Sensor aggregates (tính khi đóng session)
  tempMin: float, tempMax: float, tempAvg: float
  pressureMin: float, pressureMax: float, pressureAvg: float
  flowMin: float, flowMax: float, flowTotal: float
  currentMin: float, currentMax: float, currentAvg: float
  phaseCount: number           // max ELECTRICAL_PHASE value trong session

  // Overcurrent detail (từ AlertLog)
  overcurrentDetected: boolean    // có CRITICAL alert cho ELECTRICAL_CURRENT
  overcurrentCount: number        // số lần xảy ra
  overcurrentMaxCurrent: float    // max current khi quá dòng

  hasAlert: boolean               // có bất kỳ alert nào trong session

  // Session integrity
  status: 'active' | 'completed' | 'interrupted'
  interruptedReason: 'lwt' | 'esp_reboot' | 'timeout' | null
  // lwt = ESP mất điện đột ngột (LWT publish)
  // esp_reboot = ESP reboot, gửi PUMP_STATUS=0 không có sessionId
  // timeout = cron detect no sensor data >30s (covers server down + QoS 0 drop)

  createdAt: timestamp
}
// Indexes: (deviceId, startedAt), (deviceId, sessionNumber)
```

---

### 3. Device Entity — thêm 2 field

```typescript
operatingLifeHours: float | null   // giới hạn (vd: 200h), null = không giới hạn
totalOperatingHours: float         // tích lũy từ tất cả sessions (default: 0)
```

---

### 4. New Module: `PumpModule`

```
src/pump/
├── pump.module.ts
├── pump.service.ts          // business logic + event listeners
├── pump.controller.ts       // REST endpoints
└── entities/
    └── pump-session.entity.ts
```

**PumpService event listeners:**
- `@OnEvent('pump.started')` → tìm open session hoặc tạo mới với `sessionNumber++`. Tạo sessionId (UUID) → publish xuống ESP qua `device/{id}/session` topic: `{sessionId: "uuid"}`
- `@OnEvent('pump.stopped')` →
  1. Tìm open session bằng `sessionId` (nếu có) hoặc bằng `deviceId` (nếu không có sessionId → esp_reboot)
  2. Query SensorData[startedAt..now] cho 5 sensor types → tính aggregates
  3. Query AlertLog[startedAt..now] → set overcurrent fields + `hasAlert`
  4. Đóng session: set endedAt, durationSeconds, status=`completed`
  5. UPDATE Device: `totalOperatingHours += durationSeconds / 3600` (atomic transaction)
- `@OnEvent('pump.stopped')` khi **không có sessionId** →
  1. Tìm open session bằng deviceId → đóng với status=`interrupted`, interruptedReason=`esp_reboot`
  2. **KHÔNG cộng** vào `totalOperatingHours`
- `@OnEvent('pump.disconnected')` (LWT) →
  1. Tìm open session
  2. endedAt = MAX(created_at) FROM sensor_data WHERE device_id AND created_at >= startedAt
  3. Đóng session với status=`interrupted`, interruptedReason=`lwt`
  4. **KHÔNG cộng** vào `totalOperatingHours` (thời gian không chính xác)

**Cron: stale session cleanup** — `@Interval(60_000)`:
- Tìm sessions `status='active'` mà không có sensor_data trong 30s
- endedAt = last sensor_data timestamp cho device
- status=`interrupted`, interruptedReason=`timeout`
- **KHÔNG cộng** vào `totalOperatingHours`
- Covers: server down rồi restart, QoS 0 bị drop, network issues

**Session ID Handshake (QoS 0):**
```
ESP → PUMP_STATUS=1
Server → tạo PumpSession → publish sessionId qua device/{id}/session
ESP → lưu sessionId trong RAM

Pump dừng:
ESP → PUMP_STATUS=0 + sessionId → xóa sessionId khỏi RAM (gửi 1 lần, QoS 0)
Server → tìm by sessionId → close → completed
```

**SyncService changes (nhỏ):**
- Khi nhận PUMP_STATUS telemetry: emit `pump.started` / `pump.stopped` (include sessionId nếu có) — KHÔNG lưu SensorData
- Khi nhận `device/{id}/status` với `reason: "lwt"`: emit `pump.disconnected`

**totalOperatingHours** chỉ cộng session `completed`. Session `interrupted` (lwt/esp_reboot/timeout) KHÔNG tính.

---

### 5. Report API

```
GET /api/pump/report/:deviceId?from=&to=&format=json|excel
```

**Auto granularity:**
```
range ≤ 2 days   → hour  (label: "10:00")
range ≤ 60 days  → day   (label: "14/03")
range ≤ 365 days → week  (label: "W11/2026")
range > 365 days → month (label: "03/2026")
```
Tái dụng `DATE_TRUNC` pattern từ `SensorService.getDeviceTimeseries()` (DRY).

**Response:**
```json
{
  "deviceId": "...",
  "deviceName": "Pump A",
  "period": { "from": "...", "to": "..." },

  "summary": {
    "totalSessions": 45,
    "totalRuntimeHours": 185.5,
    "avgSessionMinutes": 24.7,
    "overcurrentSessions": 2,
    "alertSessions": 5,
    "lwtClosedSessions": 1
  },

  "maintenanceInfo": {
    "operatingLifeHours": 200,
    "totalOperatingHours": 185.5,
    "remainingLifeHours": 14.5,
    "usagePercent": 92.75,
    "maintenanceWarning": true,     // >= 80%
    "maintenanceRequired": false    // >= 100%
  },

  "timeline": {
    "granularity": "day",
    "buckets": [
      {
        "period": "2026-03-14T00:00:00",
        "label": "14/03",
        "sessions": 3,
        "runtimeMinutes": 95,
        "overcurrentCount": 1,
        "alertCount": 2,
        "avgTemp": 58.3,
        "maxCurrent": 18.5
      }
    ]
  },

  "sessions": [
    {
      "sessionNumber": 45,
      "startedAt": "...",
      "endedAt": "...",
      "durationMinutes": 32,
      "temp": { "min": 45.2, "max": 72.1, "avg": 58.3 },
      "pressure": { "min": 2.1, "max": 3.8, "avg": 3.0 },
      "flow": { "min": 12.0, "max": 18.5, "total": 540.0 },
      "current": { "min": 4.2, "max": 9.8, "avg": 6.1 },
      "phaseCount": 3,
      "overcurrent": { "detected": false, "occurrences": 0, "maxCurrent": null },
      "hasAlert": false,
      "closedByLwt": false
    }
  ]
}
```

---

### 6. Excel Export

Library: **`exceljs`**
1 sheet: "Pump Sessions"

| Session# | Bắt đầu | Kết thúc | Thời gian (ph) | Nhiệt độ Min/Max | Áp suất Min/Max | Lưu lượng (tổng) | Dòng điện Max | Quá dòng | Số pha | Cảnh báo |
|---|---|---|---|---|---|---|---|---|---|---|

- Header row: bold + background màu
- Footer row: tổng kết (total sessions, total runtime, overcurrent count)
- Sheet "Maintenance" (nếu `maintenanceWarning=true`): thông tin cảnh báo bảo trì

---

## Implementation Considerations

| Item | Decision |
|---|---|
| PUMP_STATUS lưu SensorData? | Không — ephemeral trigger, YAGNI |
| Open session khi server restart | Session vẫn trong DB → ESP re-send PUMP_STATUS=1 → backend tìm open session → re-publish sessionId |
| Session ID handshake | Server gen UUID → publish qua device/{id}/session → ESP lưu RAM → gửi lại khi close |
| QoS level | 0 (fire and forget) — ESP gửi close 1 lần rồi xóa sessionId |
| Interrupted session detection | 3 reasons: lwt, esp_reboot, timeout (cron 30s no data) |
| Cron endedAt | Last sensor_data timestamp — chính xác ±2s |
| totalOperatingHours | Chỉ cộng completed sessions |
| ELECTRICAL_PHASE value | Số pha: 1, 2, 3 — track max trong session |
| Overcurrent detection | Từ AlertLog CRITICAL cho ELECTRICAL_CURRENT (count + maxValue) |
| totalOperatingHours khi LWT | KHÔNG cộng — thời gian không chính xác |
| maintenanceRequired threshold | >= 100% |
| maintenanceWarning threshold | >= 80% |
| Report granularity | Auto detect từ range: ≤2d→hour, ≤60d→day, ≤365d→week, else→month |
| Timeline query | Tái dụng DATE_TRUNC pattern từ SensorService |
| LWT topic | `device/{deviceId}/status` với payload `{online: false, reason: "lwt"}` |

### Session Integrity Flow

| Scenario | Trigger | status | interruptedReason | totalHours? |
|---|---|---|---|---|
| Pump dừng bình thường (đúng sessionId) | PUMP_STATUS=0 + sessionId | `completed` | null | ✅ Cộng |
| ESP reboot (mất RAM, mất sessionId) | PUMP_STATUS=0, no sessionId | `interrupted` | `esp_reboot` | ❌ Không |
| ESP crash/mất điện | LWT auto-publish | `interrupted` | `lwt` | ❌ Không |
| Server down + QoS 0 drop / no data | Cron: no sensor data >30s | `interrupted` | `timeout` | ❌ Không |
| Server restart, pump vẫn chạy | ESP re-send PUMP_STATUS=1 → reuse session | `active` | — | — |
| ESP reboot → pump dừng | Pump dừng khi reboot, boot lại check schedule → tạo session mới nếu cần | — | — | — |

**Cron endedAt cho interrupted sessions:** `MAX(created_at) FROM sensor_data WHERE device_id AND created_at >= startedAt` → chính xác ±2s (telemetry interval 2s).

---

## Risks

1. **LWT bị delay** — EMQX có Keep-Alive timeout trước khi publish LWT (thường 1-2× keepAlive period). Session có thể mở 30-90s sau khi ESP mất kết nối. Acceptable.
2. **SensorData gap** khi server down → aggregate thiếu dữ liệu. Acceptable.
3. **sessionNumber concurrency** → dùng `MAX(sessionNumber)+1` trong transaction có lock.

---

## Files to Create/Modify

**New:**
- `src/pump/pump.module.ts`
- `src/pump/pump.service.ts`
- `src/pump/pump.controller.ts`
- `src/pump/entities/pump-session.entity.ts`
- `src/pump/dto/pump-report-query.dto.ts`

**Modify:**
- `src/sensor/enums/sensor-type.enum.ts` — add `PUMP_STATUS`
- `src/device/entities/device.entity.ts` — add `operatingLifeHours`, `totalOperatingHours`
- `src/device/dto/update-device.dto.ts` — expose `operatingLifeHours` field
- `src/app.module.ts` — import PumpModule
- `src/device/sync.service.ts` — emit pump events for PUMP_STATUS telemetry

**Dependencies:**
- `yarn add exceljs`

---

## Success Metrics

- [ ] PumpSession tự động tạo/đóng khi nhận PUMP_STATUS telemetry
- [ ] Session ID handshake: server gen → publish → ESP lưu → close kèm sessionId
- [ ] LWT → session interrupted/lwt, không cộng totalOperatingHours
- [ ] ESP reboot → session interrupted/esp_reboot (no sessionId)
- [ ] Cron: stale sessions (no data 30s) → interrupted/timeout, endedAt = last sensor timestamp
- [ ] Report API: timeline grouping đúng granularity theo range
- [ ] `maintenanceWarning` / `maintenanceRequired` flag chính xác
- [ ] overcurrentDetected + overcurrentCount + overcurrentMaxCurrent đúng từ AlertLog
- [ ] Excel download đúng format, summary row, maintenance sheet nếu cần
- [ ] Server restart → ESP reconnect → reuse open session + re-publish sessionId
