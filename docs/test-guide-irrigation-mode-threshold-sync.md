# Test Guide: Irrigation Mode Threshold Profile Sync

## Problem Fixed

When a zone schedule fires `SET_IRRIGATION_MODE` or `SET_MODE`, the backend now:
1. Updates `zone.irrigationMode` (or `device.irrigationMode`) in DB
2. Invalidates `ConfigResolutionService` cache

Without this fix, the backend evaluated thresholds using the old `irrigationMode` even after the schedule changed the mode on the ESP — causing relays to respond to the wrong threshold profile.

## Files Changed

| File | Change |
|------|--------|
| `src/schedule/schedule.service.ts` | `applyModeChange()` — updates zone/device irrigationMode in DB after schedule fires |
| `src/device/sync/sync.service.ts` | `handleDeviceResponse()` — updates `device.irrigationMode` + emits `device.mode.changed` when ESP confirms |
| `src/sensor/sensor.service.ts` | `@OnEvent('device.mode.changed')` — invalidates sensor config + config resolution cache |

---

## Prerequisites

- EMQX broker running
- At least 1 Zone with `checkAll` configured
- Zone has `ZoneSensorConfig` with thresholds defined for **both** `NORMAL` and `DRIP` (or another) `irrigationMode`
- At least 1 Device paired to the zone
- MQTT client (e.g. MQTTX) to simulate ESP device

---

## Scenario 1: Zone Schedule Fires SET_IRRIGATION_MODE

**Goal:** Verify `zone.irrigationMode` updates in DB and cache is invalidated.

### Steps

1. **Setup:** Create a zone schedule:
   ```json
   POST /schedule
   {
     "name": "Switch to Drip",
     "type": "one_time",
     "zoneId": "<your-zone-id>",
     "command": "SET_IRRIGATION_MODE",
     "params": { "mode": "drip" },
     "executeAt": "<now + 2 minutes>"
   }
   ```

2. **Verify current state** (before schedule fires):
   ```sql
   SELECT id, "irrigationMode" FROM zone WHERE id = '<zone-id>';
   -- Expected: normal (or null)
   ```

3. **Wait for schedule to fire** (check logs):
   ```
   Applied irrigationMode="drip" to zone <zone-id>
   ```

4. **Verify DB updated:**
   ```sql
   SELECT id, "irrigationMode" FROM zone WHERE id = '<zone-id>';
   -- Expected: drip
   ```

5. **Send telemetry from MQTT client** on `device/<deviceId>/telemetry`:
   ```json
   { "soilMoisture": 15 }
   ```
   Verify backend log shows threshold evaluation using drip profile (not normal).

---

## Scenario 2: Device Schedule Fires SET_IRRIGATION_MODE

**Goal:** Verify `device.irrigationMode` updates for device-level schedules.

### Steps

1. Create a device schedule (same as above but use `deviceId` instead of `zoneId`).
2. After schedule fires, check DB:
   ```sql
   SELECT id, "irrigationMode" FROM device WHERE id = '<device-id>';
   -- Expected: drip
   ```

---

## Scenario 3: ESP Confirms Mode Change via MQTT Response

**Goal:** Verify reactive DB update via `handleDeviceResponse`.

### Steps

1. Publish a mock ESP response to `device/<deviceId>/resp`:
   ```json
   {
     "command": "SET_IRRIGATION_MODE",
     "success": true,
     "mode": "drip"
   }
   ```

2. Check server logs:
   ```
   Device <deviceId> irrigationMode updated to drip
   ```

3. Verify `device.irrigationMode` in DB:
   ```sql
   SELECT id, "irrigationMode" FROM device WHERE id = '<device-id>';
   -- Expected: drip
   ```

4. Verify cache invalidated — send telemetry immediately:
   ```json
   { "soilMoisture": 15 }
   ```
   Next telemetry evaluation should use drip thresholds.

---

## Scenario 4: SET_MODE Command (Alternative Command Name)

Same as Scenario 3 but publish:
```json
{
  "command": "SET_MODE",
  "success": true,
  "irrigationMode": "normal"
}
```
Both `params.mode` and `params.irrigationMode` keys are supported.

---

## Scenario 5: Invalid or Missing Mode in Params

**Goal:** Verify graceful no-op when params are missing/invalid.

### Steps

1. Create a schedule with `SET_IRRIGATION_MODE` but no mode param:
   ```json
   { "command": "SET_IRRIGATION_MODE", "params": {} }
   ```
2. After firing: `zone.irrigationMode` should **not** change in DB.
3. No error should be thrown — schedule completes normally.

---

## Scenario 6: Farm-Level Schedule

**Goal:** Verify all devices in a farm get `irrigationMode` updated.

### Steps

1. Create schedule with `farmId`:
   ```json
   {
     "command": "SET_IRRIGATION_MODE",
     "params": { "mode": "spray" },
     "farmId": "<farm-id>"
   }
   ```
2. After firing, verify **all** devices in farm updated:
   ```sql
   SELECT id, "irrigationMode" FROM device WHERE "farmId" = '<farm-id>';
   -- Expected: all rows show "spray"
   ```

---

## Threshold Evaluation Validation

To confirm threshold evaluation uses the new profile after mode change:

1. Configure two threshold profiles on a `ZoneSensorConfig`:
   - `irrigationMode = normal`, `CRITICAL`, `minThreshold = 30`, `action = PUMP_ON`
   - `irrigationMode = drip`, `CRITICAL`, `minThreshold = 10`, `action = PUMP_ON`

2. Switch zone to `drip` via schedule.

3. Send telemetry with `soilMoisture = 20`:
   - **Before fix:** backend uses normal profile → `20 < 30` → triggers PUMP_ON
   - **After fix:** backend uses drip profile → `20 > 10` → no trigger

4. Verify `alert_log` and `command_log` tables match expected behavior.

---

## Cache TTL Note

`ConfigResolutionService` has a 60s TTL cache. The fix explicitly invalidates it on mode change, so threshold evaluation picks up the new mode **immediately** (not after 60s).
