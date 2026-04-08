# Test Guide: Gateway-Device Enforcement

**Feature:** Enforce device↔gateway mapping — devices with `gatewayId` must connect through their assigned gateway; gateways may only publish to their own devices; auto-discovery assigns devices via LoRa scan report.
**Endpoints / Functions:**
- `POST /gateways/:id/devices` — assign devices to gateway
- `DELETE /gateways/:id/devices` — unassign devices from gateway
- `GET /gateways/:id/devices` — list devices assigned to a gateway
- MQTT auth webhook `/api/emqx/auth` — device direct-connect enforcement
- MQTT ACL webhook `/api/emqx/acl` — gateway topic ownership
- MQTT topic `gateway/{gwId}/devices/report` — auto-discovery ingestion

**Date:** 2026-04-08

---

## Prerequisites

### Start the app
```bash
docker-compose up          # PostgreSQL + EMQX
yarn start:dev             # NestJS dev server on :3000
```

### Get auth token
```bash
# Sign in as a test user
curl -s -X POST http://localhost:3000/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password"}' | jq -r '.accessToken'
```

### Export env vars
```bash
export BASE=http://localhost:3000
export TOKEN="<accessToken from above>"
export AUTH="Authorization: Bearer $TOKEN"

# After creating test data below:
export FARM_ID="<farmId>"
export GW_ID="<gatewayId>"
export DEV_ID="<deviceId>"
export EMQX_BASE=http://localhost:18083/api/v5   # EMQX dashboard API (optional)
```

### Seed test data (SQL)
```sql
-- Create a farm
INSERT INTO farm (id, name, "userId") VALUES
  (gen_random_uuid(), 'Test Farm', '<your-user-id>');

-- Create a gateway (paired, with mqttToken)
INSERT INTO gateway (id, serial, status, "farmId", "mqttToken")
VALUES
  (gen_random_uuid(), 'GW-001', 'paired', '<farmId>', 'gw-secret-token');

-- Create devices in same farm (deviceToken set, no gatewayId)
INSERT INTO device (id, name, imei, serial, status, "farmId", "deviceToken")
VALUES
  (gen_random_uuid(), 'Device A', 'IMEI-001', 'SN-001', 'paired', '<farmId>', 'dev-token-a'),
  (gen_random_uuid(), 'Device B', 'IMEI-002', 'SN-002', 'paired', '<farmId>', 'dev-token-b');

-- Device in a different farm (for cross-farm test)
INSERT INTO farm (id, name, "userId") VALUES (gen_random_uuid(), 'Other Farm', '<other-user-id>');
INSERT INTO device (id, name, imei, serial, status, "farmId", "deviceToken")
VALUES (gen_random_uuid(), 'Device C', 'IMEI-003', 'SN-003', 'paired', '<other-farmId>', 'dev-token-c');
```

---

## Test Scenario 1: Assign Devices to Gateway

### Goal
`POST /gateways/:id/devices` assigns same-farm devices and sets `gateway_id` in DB.

### Setup
Verify devices have no gateway assignment:
```sql
SELECT id, serial, gateway_id FROM device WHERE farm_id = '<farmId>';
-- gateway_id should be NULL for Device A and Device B
```

### Execute
```bash
curl -s -X POST $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceIds\": [\"$DEV_ID\"]}" | jq
```

### Verify
Expected response:
```json
{ "assigned": 1 }
```

DB check:
```sql
SELECT id, serial, gateway_id FROM device WHERE id = '<DEV_ID>';
-- gateway_id should equal GW_ID
```

### Expected result
- Response: `{ assigned: 1 }`
- DB: `device.gateway_id` = `GW_ID` for Device A

---

## Test Scenario 2: List Devices Assigned to Gateway

### Goal
`GET /gateways/:id/devices` returns all devices currently assigned.

### Setup
Ensure Scenario 1 ran (Device A assigned).

### Execute
```bash
curl -s $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" | jq '[.[] | {id, serial, gatewayId}]'
```

### Verify
Response includes Device A with `gatewayId = GW_ID`. Device B (unassigned) not present.

### Expected result
- Array with 1 item (Device A)
- `gatewayId` matches `GW_ID`

---

## Test Scenario 3: Unassign Devices from Gateway

### Goal
`DELETE /gateways/:id/devices` clears `gateway_id` and allows direct MQTT reconnect.

### Setup
Device A must be assigned (run Scenario 1 first).

### Execute
```bash
curl -s -X DELETE $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceIds\": [\"$DEV_ID\"]}" | jq
```

### Verify
Expected response:
```json
{ "unassigned": 1 }
```

DB check:
```sql
SELECT id, serial, gateway_id FROM device WHERE id = '<DEV_ID>';
-- gateway_id should be NULL
```

### Expected result
- Response: `{ unassigned: 1 }`
- DB: `device.gateway_id` = NULL for Device A

---

## Test Scenario 4: MQTT Auth — Block Direct Connect for Gateway-Assigned Device

### Goal
A device with `gatewayId` set is rejected when attempting a direct MQTT connection.

### Setup
Assign Device A to the gateway (Scenario 1 must be complete, gateway_id set).

### Execute
Simulate EMQX auth webhook call (what EMQX sends to NestJS on device connect):
```bash
curl -s -X POST $BASE/api/emqx/auth \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"$DEV_ID\",
    \"password\": \"dev-token-a\",
    \"clientid\": \"device-client\"
  }" | jq
```

### Verify
Response should be `false` (connection rejected):
```json
false
```

Check logs for:
```
Device <DEV_ID> blocked: must connect through gateway <GW_ID>
```

### Expected result
- Direct MQTT auth: **denied** (returns `false`)
- Device must reconnect through gateway

---

## Test Scenario 5: MQTT Auth — Allow Direct Connect Without GatewayId

### Goal
A device with no `gatewayId` (WiFi direct mode) authenticates successfully.

### Setup
Ensure Device B has `gateway_id = NULL`.
```sql
SELECT id, serial, gateway_id FROM device WHERE serial = 'SN-002';
-- gateway_id must be NULL
```

### Execute
```bash
curl -s -X POST $BASE/api/emqx/auth \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"$DEV_B_ID\",
    \"password\": \"dev-token-b\",
    \"clientid\": \"device-client-b\"
  }" | jq
```

### Verify
Response should be `true`:
```json
true
```

### Expected result
- Auth: **allowed** (returns `true`)

---

## Test Scenario 6: MQTT ACL — Gateway Publish to Owned Device Topic

### Goal
Gateway can publish to `device/{deviceId}/telemetry` for its assigned device.

### Setup
Device A must be assigned to gateway (`gateway_id = GW_ID`).

### Execute
```bash
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"gateway:$GW_ID\",
    \"topic\": \"device/$DEV_ID/telemetry\",
    \"access\": 2
  }" | jq
```

### Verify
```json
true
```

### Expected result
- ACL: **allowed**

---

## Test Scenario 7: MQTT ACL — Gateway Publish to Unowned Device Topic

### Goal
Gateway is denied when trying to publish to a device it doesn't own.

### Setup
Device B has no `gateway_id` (or belongs to another gateway).

### Execute
```bash
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"gateway:$GW_ID\",
    \"topic\": \"device/$DEV_B_ID/telemetry\",
    \"access\": 2
  }" | jq
```

### Verify
```json
false
```

Check logs for:
```
Gateway <GW_ID> denied publish to device/<DEV_B_ID>/telemetry: device not assigned
```

### Expected result
- ACL: **denied**

---

## Test Scenario 8: MQTT ACL — Gateway Wildcard Subscribe Restricted to /cmd

### Goal
Gateway subscribe wildcard `device/+/cmd` is allowed; `device/+/telemetry` is denied.

### Execute
```bash
# Allowed: wildcard cmd subscribe
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\": \"gateway:$GW_ID\", \"topic\": \"device/+/cmd\", \"access\": 1}" | jq

# Denied: wildcard telemetry subscribe
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\": \"gateway:$GW_ID\", \"topic\": \"device/+/telemetry\", \"access\": 1}" | jq
```

### Verify
- First call: `true`
- Second call: `false`

### Expected result
- Gateways cannot snoop telemetry from all devices system-wide

---

## Test Scenario 9: Auto-Discovery — Gateway Reports Device Serials

### Goal
Gateway publishes a device serial list; server auto-assigns matching same-farm unowned devices.

### Setup
Device B must be unassigned (`gateway_id = NULL`).
```sql
UPDATE device SET gateway_id = NULL WHERE serial = 'SN-002';
```

### Execute
Publish to MQTT (using mosquitto_pub or MQTT client authenticated as the gateway):
```bash
mosquitto_pub \
  -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "gw-secret-token" \
  -t "gateway/$GW_ID/devices/report" \
  -m '{"devices": ["SN-002"]}' \
  -q 1
```

Wait 1–2 seconds for the event to process.

### Verify
```sql
SELECT id, serial, gateway_id FROM device WHERE serial = 'SN-002';
-- gateway_id should now equal GW_ID
```

Check logs for:
```
Gateway <GW_ID>: auto-assigned 1 devices [SN-002]
```

### Expected result
- `device.gateway_id` = `GW_ID` for Device B
- No error in logs

---

## Test Scenario 10: Auto-Discovery — Idempotent Re-report

### Goal
Re-reporting already-assigned devices is a no-op (no duplicate assignment).

### Setup
Device B already assigned to GW_ID (from Scenario 9).

### Execute
```bash
mosquitto_pub \
  -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "gw-secret-token" \
  -t "gateway/$GW_ID/devices/report" \
  -m '{"devices": ["SN-002"]}' \
  -q 1
```

### Verify
```sql
SELECT gateway_id FROM device WHERE serial = 'SN-002';
-- Still GW_ID, unchanged
```

No `auto-assigned` log line (newAssign.length === 0, early return).

### Expected result
- DB unchanged
- No spurious cache invalidation event

---

## Test Scenario 11: Auto-Discovery — Skip Device on Another Gateway

### Goal
Reporting a device that belongs to a different gateway does not reassign it.

### Setup
```sql
-- Create a second gateway
INSERT INTO gateway (id, serial, status, "farmId", "mqttToken")
VALUES (gen_random_uuid(), 'GW-002', 'paired', '<farmId>', 'gw2-secret-token');

-- Assign Device A to GW_ID
UPDATE device SET gateway_id = '<GW_ID>' WHERE serial = 'SN-001';
```

### Execute
Publish as GW-002, reporting SN-001:
```bash
mosquitto_pub \
  -h localhost -p 1883 \
  -u "gateway:$GW2_ID" -P "gw2-secret-token" \
  -t "gateway/$GW2_ID/devices/report" \
  -m '{"devices": ["SN-001"]}' \
  -q 1
```

### Verify
```sql
SELECT gateway_id FROM device WHERE serial = 'SN-001';
-- Still GW_ID (not stolen by GW2)
```

Check logs for:
```
Gateway <GW2_ID>: 1 devices already assigned to other gateways
```

### Expected result
- Device A not reassigned
- Warning logged

---

## Edge Cases

### E1: Assign empty deviceIds array (400)
```bash
curl -s -X POST $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"deviceIds": []}' | jq
# Expected: 400 Bad Request (ArrayMinSize validation)
```

### E2: Assign devices from another farm (400)
```bash
curl -s -X POST $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"deviceIds\": [\"$DEV_C_ID\"]}" | jq
# Expected: 400 "No valid devices found in same farm"
```

### E3: Non-existent gateway (404)
```bash
curl -s -X GET $BASE/gateways/00000000-0000-0000-0000-000000000000/devices \
  -H "$AUTH" | jq
# Expected: 404 Not Found
```

### E4: No auth header (401)
```bash
curl -s -X GET $BASE/gateways/$GW_ID/devices | jq
# Expected: 401 Unauthorized
```

### E5: Invalid UUID in deviceIds (400)
```bash
curl -s -X POST $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"deviceIds": ["not-a-uuid"]}' | jq
# Expected: 400 Bad Request (IsUUID validation)
```

### E6: ACL cache invalidation after unassign
```bash
# 1. Assign Device A → cache populated
curl -s -X POST $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"deviceIds\": [\"$DEV_ID\"]}" | jq

# 2. Verify gateway can publish (ACL returns true)
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\": \"gateway:$GW_ID\", \"topic\": \"device/$DEV_ID/telemetry\", \"access\": 2}" | jq
# → true

# 3. Unassign Device A → cache invalidated
curl -s -X DELETE $BASE/gateways/$GW_ID/devices \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"deviceIds\": [\"$DEV_ID\"]}" | jq

# 4. ACL check immediately — must return false (fresh DB query)
curl -s -X POST $BASE/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\": \"gateway:$GW_ID\", \"topic\": \"device/$DEV_ID/telemetry\", \"access\": 2}" | jq
# → false
```

---

## Checklist

- [ ] Scenario 1: Assign devices — response + DB verified
- [ ] Scenario 2: List gateway devices
- [ ] Scenario 3: Unassign devices — response + DB verified
- [ ] Scenario 4: MQTT auth blocks direct connect for assigned device
- [ ] Scenario 5: MQTT auth allows direct connect for unassigned device
- [ ] Scenario 6: ACL allows gateway publish to owned device
- [ ] Scenario 7: ACL denies gateway publish to unowned device
- [ ] Scenario 8: Wildcard subscribe restricted to `device/+/cmd`
- [ ] Scenario 9: Auto-discovery assigns same-farm devices
- [ ] Scenario 10: Auto-discovery idempotent re-report
- [ ] Scenario 11: Auto-discovery skips device on another gateway
- [ ] E1: Empty deviceIds → 400
- [ ] E2: Cross-farm assign → 400
- [ ] E3: Non-existent gateway → 404
- [ ] E4: No auth → 401
- [ ] E5: Invalid UUID → 400
- [ ] E6: Cache invalidated on unassign
