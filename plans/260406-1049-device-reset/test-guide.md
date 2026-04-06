# Test Guide: Device Reset / Clean Device Data

**Feature:** Complete device cleanup on delete and soft-reset  
**Endpoints:** `DELETE /device/:id`, `POST /device/:id/reset`  
**Date:** 2026-04-06

---

## Prerequisites

1. App running: `yarn start:dev` (or Docker: `docker-compose up`)
2. Base URL: `http://localhost:3000`
3. Get a JWT token via `POST /auth/sign-in`
4. Have a device that has been provisioned and paired (has SensorConfigs, SensorData, etc.)

### Get JWT token
```bash
curl -X POST http://localhost:3000/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpassword"}'
# Copy the accessToken from response
export TOKEN="<accessToken>"
export DEVICE_ID="<uuid-of-device>"
```

---

## Test Scenario 1: DELETE /device/:id — Full Cleanup + Delete

### Goal
Verify that deleting a device removes ALL related data, not just the device row.

### Setup: Confirm data exists before deletion
```sql
-- Run in psql or any DB client
SELECT COUNT(*) FROM sensor_data WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM alert_log WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM command_log WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM sensor_config WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM device_schedule WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM pairing_token WHERE serial = '<DEVICE_SERIAL>';
```
Expected: non-zero counts in at least some tables.

### Execute
```bash
curl -X DELETE http://localhost:3000/device/$DEVICE_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Verify
```sql
-- All should return 0
SELECT COUNT(*) FROM device WHERE id = '<DEVICE_ID>';          -- device deleted
SELECT COUNT(*) FROM sensor_data WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM alert_log WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM command_log WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM sensor_config WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM sensor_threshold WHERE "sensorConfigId" IN
  (SELECT id FROM sensor_config WHERE "deviceId" = '<DEVICE_ID>');
SELECT COUNT(*) FROM device_schedule WHERE "deviceId" = '<DEVICE_ID>';
SELECT COUNT(*) FROM pairing_token WHERE serial = '<DEVICE_SERIAL>';
```

### Expected result
- HTTP 200, returns the deleted device object
- All DB queries above return 0

---

## Test Scenario 2: POST /device/:id/reset — Soft Reset (Keep Device Row)

### Goal
Verify that resetting a device clears all data but keeps the device record with `status: pending`, so it can be re-paired as fresh.

### Setup
Use a different device (or re-create one), ensure it has paired data.

### Execute
```bash
curl -X POST http://localhost:3000/device/$DEVICE_ID/reset \
  -H "Authorization: Bearer $TOKEN"
```

### Verify response
```json
{
  "id": "<DEVICE_ID>",
  "status": "pending",
  "deviceToken": null,
  "farmId": null,
  "pairedAt": null
}
```

### Verify DB
```sql
-- Device row still exists
SELECT id, status, "deviceToken", "farmId", "pairedAt" FROM device WHERE id = '<DEVICE_ID>';

-- All related data gone
SELECT COUNT(*) FROM sensor_data WHERE "deviceId" = '<DEVICE_ID>';     -- 0
SELECT COUNT(*) FROM alert_log WHERE "deviceId" = '<DEVICE_ID>';       -- 0
SELECT COUNT(*) FROM command_log WHERE "deviceId" = '<DEVICE_ID>';     -- 0
SELECT COUNT(*) FROM sensor_config WHERE "deviceId" = '<DEVICE_ID>';   -- 0
SELECT COUNT(*) FROM device_schedule WHERE "deviceId" = '<DEVICE_ID>'; -- 0
SELECT COUNT(*) FROM pairing_token WHERE serial = '<DEVICE_SERIAL>';   -- 0
```

### Verify re-pairing works as fresh
After reset, the device can be provisioned again:
1. Device publishes to `provision/new` with serial → new PairingToken created
2. Mobile app calls `POST /provision/pair` with new token → device moves to PAIRED
3. `GET /device/:id` should show fresh device with no history

---

## Test Scenario 3: Edge Cases

### 3a. Device with no related data (brand new device)
```bash
curl -X DELETE http://localhost:3000/device/$CLEAN_DEVICE_ID \
  -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200, no errors (empty deletes are safe).

### 3b. Non-existent device
```bash
curl -X POST http://localhost:3000/device/00000000-0000-0000-0000-000000000000/reset \
  -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 404 `{"message": "There is no device under id 00000000-..."}`

### 3c. Device with null serial (no PairingToken step)
If device was created manually (without provisioning), `serial` may be null.
Delete/reset should still work — `cleanDeviceData` skips the PairingToken delete when `serial` is null.

---

## Checklist

- [ ] DELETE removes device row and all 6 related data types
- [ ] POST /reset keeps device row, clears all 6 data types, status=pending
- [ ] POST /reset allows fresh re-provisioning/re-pairing
- [ ] Edge: device with no data → no errors
- [ ] Edge: non-existent device → 404
- [ ] Edge: null serial → no crash
