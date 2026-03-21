# Zone Hierarchy Refactor — Test Guide

**Branch:** master | **Date:** 2026-03-20

---

## Prerequisites

```bash
# Start stack
docker-compose up -d

# Copy env and verify DB connection
cp .env.example .env
# DB_HOST=localhost, DB_PORT=5432, etc.

yarn start:dev
# Swagger: http://localhost:3000/api
```

---

## 1. Auth Setup

```bash
# Sign up + sign in, grab accessToken
POST /auth/sign-up   { email, password, name }
POST /auth/sign-in   { email, password }
# → { accessToken, refreshToken }
```

All requests below need `Authorization: Bearer <accessToken>`.

---

## 2. Baseline Data Setup

Create farm → zone → device in order (zoneId is nullable, so device can exist without zone).

### 2.1 Create Farm

```bash
POST /farm
{
  "name": "Test Farm",
  "coordinates": [
    { "lat": 10.762622, "lng": 106.660172 },
    { "lat": 10.763000, "lng": 106.661000 }
  ]
}
# → { id: "FARM_ID", ... }
```

### 2.2 Create Zone

```bash
POST /zone
{
  "farmId": "FARM_ID",
  "name": "Zone A",
  "irrigationMode": "drip",
  "controlMode": "auto",
  "coordinates": [
    { "lat": 10.762700, "lng": 106.660200 }
  ]
}
# → { id: "ZONE_ID", checkAll: false, pumpEnabled: false, ... }
```

### 2.3 Create Device (without zone first)

```bash
POST /device
{ "name": "Sensor Node 1", "farmId": "FARM_ID" }
# → { id: "DEVICE_ID", zoneId: null, ... }
```

### 2.4 Assign Device to Zone

```bash
PATCH /device/DEVICE_ID
{ "zoneId": "ZONE_ID" }
# → device.zoneId = ZONE_ID
# → device.farmId must remain same FARM_ID (denormalized sync)
```

**Verify denormalized farmId sync:**
```bash
GET /device/DEVICE_ID
# → { zoneId: "ZONE_ID", farmId: "FARM_ID" }  ← both must be set
```

---

## 3. Zone CRUD

```bash
GET /zone?farmId=FARM_ID        # list zones in farm
GET /zone/ZONE_ID               # get one (includes devices, sensorConfigs)
PATCH /zone/ZONE_ID { "name": "Zone Alpha" }
DELETE /zone/ZONE_ID            # cascades to devices? No — devices remain, zoneId nulled
```

---

## 4. Zone Sensor Config & Threshold

### 4.1 Create zone-level sensor config

```bash
POST /zone/ZONE_ID/sensor-config
{
  "sensorType": "temperature",
  "enabled": true,
  "unit": "°C"
}
# → { id: "ZSC_ID", zoneId: "ZONE_ID", sensorType: "temperature" }
```

### 4.2 Create zone threshold — generic (no irrigationMode)

```bash
POST /zone/ZONE_ID/sensor-config/ZSC_ID/threshold
{
  "level": "WARNING",
  "minThreshold": 15,
  "maxThreshold": 35,
  "action": "ALERT"
}
# irrigationMode omitted → null → applies to all modes as fallback
```

### 4.3 Create zone threshold — irrigation-mode-specific

```bash
POST /zone/ZONE_ID/sensor-config/ZSC_ID/threshold
{
  "level": "CRITICAL",
  "irrigationMode": "drip",
  "minThreshold": 10,
  "maxThreshold": 40,
  "action": "PUMP_OFF"
}
```

**Duplicate constraint check:**
```bash
# Re-POST same { level: "CRITICAL", irrigationMode: "drip" } → 409 Conflict
```

### 4.4 Verify thresholds

```bash
GET /zone/ZONE_ID/sensor-config/ZSC_ID/threshold
# → [ WARNING/null, CRITICAL/drip ]
```

---

## 5. Config Resolution Logic

These scenarios test `ConfigResolutionService.resolveConfig()` and `resolveThresholdsForSensor()` indirectly via the sensor pipeline.

### 5.1 Device-level config (no zone)

- Device with `irrigationMode: normal`, no zone
- Simulate telemetry → resolved mode = `device.irrigationMode` = **normal**

### 5.2 Zone config, checkAll = false (default)

- Device has `irrigationMode: drip`
- Zone has `irrigationMode: spray`, `checkAll: false`
- Expected resolved: `device.irrigationMode` wins → **drip**

```bash
PATCH /zone/ZONE_ID { "checkAll": false }
PATCH /device/DEVICE_ID { "irrigationMode": "drip" }
```

### 5.3 Zone config, checkAll = true (zone overrides)

- Zone has `irrigationMode: spray`, `checkAll: true`
- Expected resolved: `zone.irrigationMode` wins → **spray**

```bash
PATCH /zone/ZONE_ID { "checkAll": true, "irrigationMode": "spray" }
```

### 5.4 Threshold fallback chain

| Scenario | Device threshold | Zone threshold | Expected picked |
|----------|-----------------|----------------|-----------------|
| Device has mode-specific | `CRITICAL/drip` | `CRITICAL/null` | device `CRITICAL/drip` |
| Device has null only | `CRITICAL/null` | `CRITICAL/drip` | device `CRITICAL/null` |
| Device has nothing | — | `CRITICAL/drip` | zone `CRITICAL/drip` |
| Device has nothing, no mode match | — | `CRITICAL/null` | zone `CRITICAL/null` |
| checkAll=true | `CRITICAL/drip` | `CRITICAL/spray` | zone `CRITICAL/spray` (ignored device) |

---

## 6. Zone Pump Control

### 6.1 Turn on pump for all devices in zone

```bash
POST /zone/ZONE_ID/pump
{ "action": "PUMP_ON" }
# → sends MQTT "PUMP_ON" command to every device in zone
# → zone.pumpEnabled = true
```

**Expected:** If 3 devices in zone → 3 MQTT publishes to `device/{deviceId}/cmd`
**Partial failure:** Uses `Promise.allSettled` → one offline device won't block others. Response shows individual results.

### 6.2 Turn off pump

```bash
POST /zone/ZONE_ID/pump
{ "action": "PUMP_OFF" }
# → zone.pumpEnabled = false
```

---

## 7. Schedule with Zone Target

### 7.1 Create zone schedule

```bash
POST /schedule
{
  "name": "Morning Irrigation",
  "type": "recurring",
  "zoneId": "ZONE_ID",
  "command": "PUMP_ON",
  "daysOfWeek": [1, 3, 5],
  "time": "06:00",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

### 7.2 Validation — exactly one target required

```bash
# Both deviceId + zoneId → 400
POST /schedule { "deviceId": "X", "zoneId": "Y", ... }

# Neither → 400
POST /schedule { "name": "...", "command": "...", ... }
```

### 7.3 Query by zone

```bash
GET /schedule?zoneId=ZONE_ID
```

### 7.4 Toggle schedule

```bash
PATCH /schedule/SCHEDULE_ID/toggle
# → enabled flips
```

---

## 8. Sensor Pipeline Integration

### 8.1 Mock telemetry event (via MQTT or direct test)

Publish to `device/{DEVICE_ID}/telemetry`:
```json
{ "temperature": 42.5, "humidity": 80 }
```

**Expected flow:**
1. `SyncService` receives MQTT → emits `telemetry.received` with `{ deviceId, farmId, zoneId, payload }`
2. `SensorService` picks up event
3. Calls `ConfigResolutionService.getDeviceContext(deviceId)` (cached 60s)
4. Resolves active `irrigationMode` via `resolveConfig()`
5. For each sensor reading, calls `resolveThresholdsForSensor()` with fallback chain
6. `ThresholdService.evaluate()` runs against resolved thresholds
7. If threshold breached → MQTT command dispatched + alert logged

**Verify in DB:**
```sql
SELECT * FROM sensor_data WHERE device_id = 'DEVICE_ID' ORDER BY created_at DESC LIMIT 5;
SELECT * FROM alert_log WHERE device_id = 'DEVICE_ID' ORDER BY created_at DESC LIMIT 5;
SELECT * FROM command_log WHERE device_id = 'DEVICE_ID' ORDER BY created_at DESC LIMIT 5;
```

### 8.2 Cache invalidation test

1. Send telemetry → check context loaded from DB
2. `PATCH /zone/ZONE_ID { "irrigationMode": "spray" }` → cache invalidated for all zone devices
3. Send telemetry again → context reloaded from DB with new irrigationMode

---

## 9. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Device with `zoneId=null` (legacy) | `ConfigResolutionService` returns `zone: null`, uses device-only config |
| Zone deleted, device still has `zoneId` | `getDeviceContext` finds device but zone query returns null → graceful fallback |
| `checkAll=true`, zone has no thresholds | Falls back to `null` → `ThresholdService` evaluates nothing |
| Schedule for zone with 0 devices | `execute()` loops over empty array, no error |
| `POST /zone/ZONE_ID/pump` with no devices | Returns `{ results: [] }` or similar — no crash |
| Device moved to different zone | `PATCH /device { zoneId: NEW_ZONE_ID }` → `farmId` auto-syncs to new zone's farm |

---

## 10. Shared Enum Backward Compatibility

```bash
# These should still work (pump module re-exports shared enums)
# PumpOperationMode.DRIP === IrrigationMode.DRIP
# PumpControlMode.AUTO === ControlMode.AUTO
```

Check that existing pump-related endpoints still function correctly after the enum re-export change.

---

## Quick Sanity Checklist

- [ ] `GET /farm/FARM_ID` includes `zones` array
- [ ] `GET /zone/ZONE_ID` includes `devices` and `sensorConfigs`
- [ ] Device `farmId` auto-syncs when `zoneId` changes
- [ ] Zone threshold `@Unique(['zoneSensorConfigId', 'level', 'irrigationMode'])` enforced
- [ ] Device threshold `@Unique(['sensorConfigId', 'level', 'irrigationMode'])` enforced
- [ ] `checkAll=true` zone config overrides device config in resolved thresholds
- [ ] Zone pump dispatch uses `Promise.allSettled` (partial failure doesn't abort)
- [ ] Schedule `zoneId` works alongside existing `deviceId` / `farmId`
- [ ] Telemetry `zoneId` propagated in event payload
- [ ] 60s device context cache invalidated on zone/device config change
