# Pump Session Tracking - Test Guide

## Prerequisites

- EMQX broker running (port 1883)
- PostgreSQL running
- Server running: `yarn start:dev`
- MQTT client: `mosquitto_pub` / `mosquitto_sub` or MQTT Explorer
- JWT token for API calls (from `POST /api/auth/login`)

---

## 1. Setup

### 1.1 Get a device ID

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/device
```

Note a `deviceId` and `farmId` from a paired device.

### 1.2 Subscribe to session topic (to verify handshake)

```bash
mosquitto_sub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/session" -v
```

---

## 2. Session Lifecycle Tests

### 2.1 Normal session (pump on → off with sessionId)

**Step 1: Start pump**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"pumpStatus":1,"temperature":55,"pressure":3.2,"flow":12.5,"current":8.1,"phase":3}'
```

**Expected:**
- `pump_session` row created in DB with `status = active`
- Server publishes `{"sessionId":"<uuid>","timestamp":"..."}` to `device/<deviceId>/session`
- WebSocket clients receive `type: pump_session_started`

**Step 2: Send sensor data during session**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"temperature":57,"pressure":3.4,"flow":13.2,"current":8.5,"phase":3}'
```

**Step 3: Stop pump (with sessionId)**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"pumpStatus":0,"sessionId":"<uuid-from-step1>"}'
```

**Expected:**
- Session row: `status = completed`, `endedAt` set, `durationSeconds` computed
- Sensor aggregates populated (tempMin/Max/Avg, pressureMin/Max/Avg, etc.)
- `device.totalOperatingHours` incremented
- WebSocket clients receive `type: pump_session_ended`

---

### 2.2 ESP reboot (pump off without sessionId)

**Step 1: Start pump** (same as 2.1 Step 1)

**Step 2: Stop without sessionId**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"pumpStatus":0}'
```

**Expected:**
- Session: `status = interrupted`, `interruptedReason = esp_reboot`
- `totalOperatingHours` NOT incremented

---

### 2.3 LWT disconnect

**Step 1: Start pump** (same as 2.1 Step 1)

**Step 2: Simulate LWT**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/status" \
  -m '{"reason":"lwt","timestamp":"2026-03-16T10:00:00Z"}'
```

**Expected:**
- Session: `status = interrupted`, `interruptedReason = lwt`
- `endedAt` = last sensor data timestamp (not current time)
- `totalOperatingHours` NOT incremented

---

### 2.4 Server restart (session reuse)

**Step 1: Start pump**

**Step 2: Restart server** (`Ctrl+C` and `yarn start:dev`)

**Step 3: Send pump start again**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"pumpStatus":1}'
```

**Expected:**
- Existing active session reused (no new row created)
- Server re-publishes the same sessionId to `device/<deviceId>/session`

---

## 3. Stale Session Cron Test

**Step 1: Start pump**

**Step 2: Stop all telemetry** (don't send any more data)

**Step 3: Wait 60+ seconds**

**Expected:**
- Session: `status = interrupted`, `interruptedReason = timeout`
- `endedAt` = last sensor data timestamp
- Server log: `Stale session <id> (device <deviceId>) closed as timeout`

---

## 4. Report API Tests

### 4.1 JSON report

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/pump/report/<deviceId>?from=2026-01-01&to=2026-12-31"
```

**Expected response shape:**
```json
{
  "summary": {
    "totalSessions": 3,
    "totalDurationHours": 1.5,
    "avgDurationMinutes": 30.0,
    "totalFlow": 450.5,
    "tempRange": { "min": 50, "max": 65 },
    "pressureRange": { "min": 2.8, "max": 4.1 },
    "currentRange": { "min": 7.2, "max": 9.5 },
    "overcurrentSessions": 0,
    "overcurrentTotalCount": 0
  },
  "maintenanceInfo": {
    "operatingLifeHours": 500,
    "totalOperatingHours": 10.5,
    "usagePercent": 2.1,
    "warningThreshold": 80,
    "isWarning": false,
    "isRequired": false
  },
  "timeline": {
    "granularity": "day",
    "data": [...]
  },
  "sessions": [...]
}
```

### 4.2 Auto granularity

| Date range | Expected granularity |
|------------|----------------------|
| `from=2026-03-15&to=2026-03-16` | `hour` (≤2 days) |
| `from=2026-01-01&to=2026-03-16` | `day` (≤60 days) |
| `from=2025-01-01&to=2026-01-01` | `week` (≤365 days) |
| `from=2024-01-01&to=2026-01-01` | `month` (>365 days) |

### 4.3 Maintenance warning

Set `operatingLifeHours` on device to a low value via `PATCH /api/device/<deviceId>`,
then add enough completed sessions to push `totalOperatingHours` ≥ 80% of that.

**Expected:** `maintenanceInfo.isWarning = true`

---

## 5. Excel Export Test

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/pump/report/<deviceId>?format=excel" \
  --output pump-report.xlsx
```

**Expected:**
- File downloads as `pump-report-<deviceId>.xlsx`
- Open in Excel/LibreOffice — verify:
  - Sheet "Pump Sessions": header row (blue), data rows, footer row (light blue)
  - Sheet "Maintenance": only present when `isWarning = true`

---

## 6. DB Verification Queries

```sql
-- All sessions for a device
SELECT id, "sessionNumber", status, "interruptedReason",
       "startedAt", "endedAt", "durationSeconds",
       "tempAvg", "currentMax", "overcurrentDetected"
FROM pump_session
WHERE "deviceId" = '<deviceId>'
ORDER BY "startedAt" DESC;

-- Device operating hours
SELECT id, name, "operatingLifeHours", "totalOperatingHours"
FROM device
WHERE id = '<deviceId>';
```

---

## 7. Expected Failure Cases

| Scenario | Expected behavior |
|----------|-------------------|
| `pump.stopped` with unknown sessionId | Log warn, no crash |
| `pump.disconnected` with no active session | Log debug, no crash |
| Report with no sessions | `totalSessions: 0`, empty arrays |
| Excel export before any sessions | Empty sheet with headers only |
