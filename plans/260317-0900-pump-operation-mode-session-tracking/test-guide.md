# Test Guide: Pump Operation Mode — Session Tracking

## Prerequisites

- Docker Compose running (PostgreSQL + EMQX)
- `.env` configured
- `yarn start:dev` running

## 1. Database Verification

After server starts, verify the new column was auto-created by TypeORM:

```sql
-- Connect to DB
psql -h localhost -U <DB_USERNAME> -d <DB_NAME>

-- Check column exists with default
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pump_session' AND column_name = 'operationMode';

-- Check enum type was created
SELECT enum_range(NULL::pump_session_operationmode_enum);
```

**Expected:** `operationMode` column exists, type `USER-DEFINED`, default `'normal'`.

## 2. MQTT Telemetry — Pump Start with Mode

Use MQTT client (MQTTX, mosquitto_pub, or EMQX dashboard) to simulate device telemetry.

### Test 2.1: Pump start with `drip` mode

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <MQTT_USERNAME> -P <MQTT_PASSWORD> \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"pumpStatus": 1, "mode": "drip", "sessionId": null}'
```

**Verify:**
```sql
SELECT id, "sessionNumber", "operationMode", "startedAt", status
FROM pump_session
WHERE "deviceId" = '<DEVICE_ID>'
ORDER BY "startedAt" DESC LIMIT 1;
```

**Expected:** `operationMode = 'drip'`, `status = 'ACTIVE'`

### Test 2.2: Pump start with `spray` mode

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <MQTT_USERNAME> -P <MQTT_PASSWORD> \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"pumpStatus": 1, "mode": "spray", "sessionId": null}'
```

**Expected:** New session with `operationMode = 'spray'`

### Test 2.3: Pump start without mode (fallback)

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <MQTT_USERNAME> -P <MQTT_PASSWORD> \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"pumpStatus": 1, "sessionId": null}'
```

**Expected:** New session with `operationMode = 'normal'` (default fallback)

### Test 2.4: Pump start with invalid mode (fallback)

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <MQTT_USERNAME> -P <MQTT_PASSWORD> \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"pumpStatus": 1, "mode": "invalid_mode", "sessionId": null}'
```

**Expected:** New session with `operationMode = 'normal'` (invalid falls back to NORMAL)

## 3. Pump Stop (close session)

Stop the pump to close active sessions before testing report:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <MQTT_USERNAME> -P <MQTT_PASSWORD> \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"pumpStatus": 0, "sessionId": "<SESSION_ID>"}'
```

## 4. Report API — JSON

### Test 4.1: Verify modeBreakdown in summary

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/pump/<DEVICE_ID>/report?from=2026-01-01&to=2026-12-31" | jq
```

**Expected response includes:**
```json
{
  "summary": {
    "totalSessions": 4,
    "modeBreakdown": [
      { "mode": "drip", "count": 1 },
      { "mode": "spray", "count": 1 },
      { "mode": "normal", "count": 2 }
    ]
  },
  "sessions": [
    {
      "operationMode": "normal",
      "sessionNumber": 4
    }
  ]
}
```

**Check:**
- `summary.modeBreakdown` array present with correct counts
- Each session in `sessions[]` has `operationMode` field

## 5. Report API — Excel Export

### Test 5.1: Download Excel and verify Operation Mode column

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  -o pump-report.xlsx \
  "http://localhost:3000/api/pump/<DEVICE_ID>/report/excel?from=2026-01-01&to=2026-12-31"
```

Open `pump-report.xlsx` and verify:

| Check | Expected |
|-------|----------|
| Column B header | "Operation Mode" |
| Column order | Session # → Operation Mode → Start → End → ... |
| Vietnamese labels | "Nho giot", "Phun mua", "Tuoi goc", "Binh thuong" |
| Default sessions | Show "Binh thuong" |

## 6. WebSocket Verification

Connect to Socket.IO `/device` namespace and join a device room. Start a pump session with mode.

**Expected broadcast:**
```json
{
  "type": "pump_session_started",
  "sessionId": "...",
  "sessionNumber": 5
}
```

## 7. Edge Cases

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Server restart with active session → pump sends pumpStatus=1 again | Reuses existing session (no duplicate) |
| 2 | ESP sends `mode: ""` (empty string) | Falls back to `normal` |
| 3 | ESP sends `mode: "DRIP"` (uppercase) | Falls back to `normal` (enum values are lowercase) |
| 4 | Existing sessions (before migration) | `operationMode` defaults to `normal` |
| 5 | Report with no sessions in date range | `modeBreakdown: []` (empty array) |

## Summary Checklist

- [ ] DB column `operationMode` auto-created
- [ ] Pump start with valid mode saves correctly (drip, spray, root, normal)
- [ ] Pump start without mode defaults to `normal`
- [ ] Pump start with invalid mode defaults to `normal`
- [ ] JSON report includes `modeBreakdown` in summary
- [ ] JSON sessions include `operationMode` field
- [ ] Excel has "Operation Mode" column with Vietnamese labels
- [ ] Build passes (`yarn build`)
