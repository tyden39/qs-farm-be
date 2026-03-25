# Fertilizer Sessions, Sensors & Reports — Test Guide

## Prerequisites

- EMQX broker running (port 1883)
- PostgreSQL running
- Server running: `yarn start:dev`
- MQTT client: `mosquitto_pub` / `mosquitto_sub` or MQTT Explorer
- JWT token from `POST /api/auth/login`
- A paired device ID with `hasFertilizer: true`

---

## 1. Setup

### 1.1 Enable fertilizer on device

```bash
curl -X PATCH http://localhost:3000/api/device/<deviceId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hasFertilizer": true }'
```

### 1.2 Subscribe to fertilizer session topic (to verify sessionId handshake)

```bash
mosquitto_sub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/fert-session" -v
```

---

## 2. Session Lifecycle Tests

### 2.1 Normal session (fertilizer on → off with sessionId)

**Step 1: Start fertilizer**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"fertStatus":1,"fertControlMode":"manual","fertTemperature":38.5,"fertCurrent":2.1,"fertPhase":3}'
```

**Expected:**
- `fertilizer_session` row in DB with `status = active`
- Server publishes `{"sessionId":"<uuid>","timestamp":"..."}` to `device/<deviceId>/fert-session`
- WebSocket clients receive `type: fertilizer_session_started`

**Step 2: Send sensor readings during session**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"fertTemperature":41.2,"fertCurrent":2.4,"fertPhase":3}'
```

**Expected:** Rows inserted in `sensor_data` with `sensorType` = `fert_temperature`, `fert_current`, `fert_phase`.

**Step 3: Stop fertilizer (with sessionId)**

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"fertStatus":0,"fertSessionId":"<uuid-from-step1>"}'
```

**Expected:**
- Session row: `status = completed`, `endedAt` set, `durationSeconds` computed
- Aggregates populated: `tempMin/Max/Avg`, `currentMin/Max/Avg`, `phaseCount`
- WebSocket clients receive `type: fertilizer_session_ended`

---

### 2.2 ESP reboot (fertilizer off without sessionId)

**Step 1:** Start fertilizer (same as 2.1 Step 1).

**Step 2:** Send without `fertSessionId`:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"fertStatus":0}'
```

**Expected:** Session row: `status = interrupted`, `interruptedReason = esp_reboot`.

---

### 2.3 LWT disconnect (device goes offline)

**Step 1:** Start fertilizer (same as 2.1 Step 1).

**Step 2:** Simulate device disconnect:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/status" \
  -m '{"reason":"lwt","timestamp":"2026-03-25T08:00:00.000Z"}'
```

**Expected:**
- Session row: `status = interrupted`, `interruptedReason = lwt`
- `endedAt` = last `fert_*` sensor data timestamp (not pump data)

---

### 2.4 Stale session cleanup (timeout)

**Step 1:** Start fertilizer (same as 2.1 Step 1).

**Step 2:** Do NOT send any further telemetry. Wait 60s for the cron to run.

**Expected:** Session row: `status = interrupted`, `interruptedReason = timeout`.

---

### 2.5 Server restart with active session (idempotent)

**Step 1:** Start fertilizer, note the `sessionId` from `device/<deviceId>/fert-session`.

**Step 2:** Restart the server (`Ctrl+C` then `yarn start:dev`).

**Step 3:** Send `fertStatus: 1` again:

```bash
mosquitto_pub ... -t "device/<deviceId>/telemetry" \
  -m '{"fertStatus":1,"fertControlMode":"manual"}'
```

**Expected:** Same `sessionId` re-published to `device/<deviceId>/fert-session` (no new session created).

---

## 3. Sensor Data Tests

### 3.1 Verify sensor types stored correctly

After sending telemetry with all fertilizer keys:

```bash
psql -U <user> -d <db> -c "
  SELECT sensor_type, value, created_at
  FROM sensor_data
  WHERE device_id = '<deviceId>'
    AND sensor_type LIKE 'fert_%'
  ORDER BY created_at DESC LIMIT 20;
"
```

**Expected rows:** `fert_temperature`, `fert_current`, `fert_phase` — **no** rows with `pump_temperature` or `electrical_current` from fertilizer payload.

### 3.2 Pump and fertilizer sensors co-exist

Send a combined telemetry with both pump and fertilizer fields:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{
    "pumpStatus":1,"temperature":55,"pressure":3.2,"flow":12.5,"current":8.1,"phase":3,
    "fertStatus":1,"fertTemperature":38.5,"fertCurrent":2.1,"fertPhase":3
  }'
```

**Expected:** Both sessions start independently. `sensor_data` has 6 rows (3 pump types + 3 fertilizer types).

---

## 4. Threshold Tests

### 4.1 Configure a fertilizer temperature threshold

```bash
# First create a SensorConfig for fert_temperature (via API or psql)
# Then add a threshold:
curl -X POST http://localhost:3000/api/sensor/<sensorConfigId>/threshold \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "critical",
    "maxValue": 50,
    "action": "FERTILIZER_OFF"
  }'
```

### 4.2 Trigger the threshold

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/telemetry" \
  -m '{"fertTemperature":55}'
```

**Expected:**
- `alert_log` row created with `sensorType = fert_temperature`, `level = critical`
- MQTT command `FERTILIZER_OFF` published to `device/<deviceId>/cmd`
- `command_log` row created with `source = automated`
- Session `hasAlert = true` when session closes

---

## 5. Schedule Tests

### 5.1 Create a recurring fertilizer schedule

```bash
curl -X POST http://localhost:3000/api/schedule \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<deviceId>",
    "type": "recurring",
    "daysOfWeek": [1,2,3,4,5],
    "time": "07:00",
    "command": "FERTILIZER_ON",
    "params": { "duration": 1200 },
    "timezone": "Asia/Ho_Chi_Minh"
  }'
```

**Expected:** `200 OK` with schedule object, `enabled: true`.

### 5.2 Create a one-time fertilizer schedule

```bash
curl -X POST http://localhost:3000/api/schedule \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<deviceId>",
    "type": "one_time",
    "executeAt": "2026-03-25T10:00:00.000Z",
    "command": "FERTILIZER_ON",
    "params": { "duration": 600 }
  }'
```

**Expected:** On execution, MQTT command published and schedule auto-disabled.

---

## 6. Report API Tests

### 6.1 JSON report

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/fertilizer/report/<deviceId>?from=2026-03-01&to=2026-03-31"
```

**Expected response shape:**

```json
{
  "summary": {
    "totalSessions": 5,
    "totalDurationHours": 1.5,
    "avgDurationMinutes": 18.0,
    "tempRange": { "min": 36.1, "max": 45.8 },
    "currentRange": { "min": 0.8, "max": 3.2 },
    "overcurrentSessions": 0,
    "overcurrentTotalCount": 0
  },
  "timeline": {
    "granularity": "day",
    "data": [{ "bucket": "...", "sessionCount": 2, "totalDurationMinutes": 36.0, "avgDurationMinutes": 18.0 }]
  },
  "sessions": [
    {
      "id": "uuid",
      "sessionNumber": 5,
      "controlMode": "manual",
      "startedAt": "...",
      "endedAt": "...",
      "durationSeconds": 1080,
      "tempMin": 36.1,
      "tempMax": 45.8,
      "tempAvg": 40.2,
      "currentMin": 0.8,
      "currentMax": 3.2,
      "currentAvg": 2.1,
      "phaseCount": 1,
      "overcurrentDetected": false,
      "hasAlert": false,
      "status": "completed"
    }
  ]
}
```

### 6.2 Excel export

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/fertilizer/report/<deviceId>?format=excel" \
  -o fertilizer-report.xlsx
```

**Expected:** `.xlsx` file downloaded. Open in Excel — should have "Fertilizer Sessions" sheet with green header row and footer totals row.

### 6.3 Empty date range

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/fertilizer/report/<deviceId>?from=2020-01-01&to=2020-01-02"
```

**Expected:** `summary.totalSessions: 0`, empty `sessions` array.

### 6.4 Unauthorized access

```bash
curl "http://localhost:3000/api/fertilizer/report/<deviceId>"
```

**Expected:** `401 Unauthorized`.

---

## 7. Isolation Tests (Pump vs Fertilizer)

### 7.1 Sessions are independent

Start both pump (`pumpStatus:1`) and fertilizer (`fertStatus:1`) simultaneously. Verify:
- Two independent active sessions in DB (one `pump_session`, one `fertilizer_session`)
- Stopping pump (`pumpStatus:0`) does NOT close fertilizer session
- Stopping fertilizer (`fertStatus:0`) does NOT close pump session

### 7.2 Aggregate isolation

After a combined session, verify via `psql`:

```sql
-- Fertilizer session should NOT contain pump sensor aggregates
SELECT temp_min, temp_max, current_min, current_max, phase_count
FROM fertilizer_session
WHERE device_id = '<deviceId>'
ORDER BY started_at DESC LIMIT 1;

-- Pump session should NOT contain fertilizer sensor aggregates
SELECT temp_min, temp_max, pressure_min, flow_total
FROM pump_session
WHERE device_id = '<deviceId>'
ORDER BY started_at DESC LIMIT 1;
```

**Expected:** Each session aggregates only its own sensor types.

### 7.3 LWT closes both sessions

Simulate LWT (section 2.3). **Both** pump and fertilizer active sessions should be interrupted.

---

## 8. Unit Tests

```bash
yarn test 2>&1 | tail -20
```

**Expected:** All existing tests pass. No regressions from new FERT_* sensor types.
