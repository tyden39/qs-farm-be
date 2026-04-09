# Test Guide: Dual-Mode Device Gateway

**Feature:** Bidirectional auto-assign of `gatewayId` at pair time; devices connect WiFi or LoRa autonomously; dual-channel OTA.
**Endpoints / Functions:**
- `POST /provision/gateway/pair` — pair gateway (bulk assigns farm devices)
- `POST /provision/pair` — pair device (auto-assigns farm gateway)
- `DELETE /gateways/:id` — delete gateway (bulk nulls device.gatewayId)
- `GET /emqx/auth` + `GET /emqx/acl` — MQTT auth/ACL (device no longer blocked when gatewayId set)
- `POST /firmware/:id/deploy` — OTA (dual-channel when device has gateway)

**Date:** 2026-04-08

---

## Prerequisites

```bash
# Start stack
docker-compose up -d
yarn start:dev

# Auth token
export TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"password"}' | jq -r '.accessToken')

# IDs (fill after setup)
export FARM_ID=""
export GATEWAY_ID=""
export DEVICE_ID=""
export DEVICE_SERIAL=""
```

**DB access:**
```bash
psql -U postgres -d qs_farm
```

---

## Scenario 1: Gateway pair auto-assigns farm devices

### Goal
When a gateway is paired to a farm, all non-disabled devices in that farm get `gatewayId` set.

### Setup
```sql
-- Confirm devices exist on farm with no gateway assigned
SELECT id, serial, status, "gatewayId" FROM device WHERE "farmId" = '$FARM_ID';
-- Record device IDs — they should have gatewayId = NULL
```

Ensure gateway is provisioned (PENDING status, has pairingToken):
```sql
SELECT id, serial, status, "pairingToken", "farmId" FROM gateway WHERE serial = 'GW-TEST-001';
```

### Execute
```bash
export GW_PAIRING_TOKEN="<token from DB>"

curl -s -X POST http://localhost:3000/api/provision/gateway/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"pairingToken\":\"$GW_PAIRING_TOKEN\",\"farmId\":\"$FARM_ID\"}" | jq
```

### Verify
```bash
# Response should contain gatewayId and mqttToken
```
```sql
-- All farm devices should now have this gatewayId
SELECT id, serial, "gatewayId" FROM device WHERE "farmId" = '$FARM_ID';

-- Gateway status should be 'paired'
SELECT id, status, "farmId", "pairedAt" FROM gateway WHERE id = '$GATEWAY_ID';
```

### Expected result
- Response: `{ gatewayId: "...", mqttToken: "..." }`
- All non-DISABLED farm devices: `gatewayId = $GATEWAY_ID`
- Gateway: `status = paired`, `farmId = $FARM_ID`

---

## Scenario 2: Device pair auto-assigns farm gateway

### Goal
When a device is paired to a farm that already has a paired gateway, the device gets `gatewayId` set automatically.

### Setup
```sql
-- Confirm farm has a paired gateway
SELECT id, status FROM gateway WHERE "farmId" = '$FARM_ID' AND status != 'disabled';

-- Device must be in PENDING status with unused pairingToken
SELECT d.id, d.status, pt.token, pt.used FROM device d
  JOIN pairing_token pt ON pt.serial = d.serial
  WHERE d.serial = '$DEVICE_SERIAL';
```

### Execute
```bash
export PAIRING_TOKEN="<token from DB>"

curl -s -X POST http://localhost:3000/api/provision/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"serial\":\"$DEVICE_SERIAL\",\"farmId\":\"$FARM_ID\",\"pairingToken\":\"$PAIRING_TOKEN\"}" | jq
```

### Verify
```sql
-- Device should have gatewayId set
SELECT id, serial, status, "farmId", "gatewayId", "pairedAt" FROM device WHERE serial = '$DEVICE_SERIAL';
```

### Expected result
- Response: `{ deviceId, serial, deviceToken, status: "paired" }`
- `device.gatewayId = $GATEWAY_ID` (farm's gateway)
- `device.farmId = $FARM_ID`, `status = paired`

---

## Scenario 3: Device pair on farm with no gateway

### Goal
Device paired to a farm with no gateway gets `gatewayId = null`.

### Setup
```sql
-- Confirm farm has no active gateway
SELECT id, status FROM gateway WHERE "farmId" = '$FARM_ID' AND status != 'disabled';
-- Should return 0 rows
```

### Execute
Same as Scenario 2 but with a farm that has no gateway.

### Verify
```sql
SELECT id, serial, "gatewayId" FROM device WHERE serial = '$DEVICE_SERIAL';
```

### Expected result
- `device.gatewayId IS NULL`

---

## Scenario 4: Gateway delete bulk-nulls device.gatewayId

### Goal
Deleting a gateway sets `gatewayId = null` on all its devices.

### Setup
```sql
-- Confirm devices are assigned to gateway
SELECT id, serial, "gatewayId" FROM device WHERE "gatewayId" = '$GATEWAY_ID';
-- Should return rows
```

### Execute
```bash
curl -s -X DELETE http://localhost:3000/api/gateways/$GATEWAY_ID \
  -H "Authorization: Bearer $TOKEN" -v
```

### Verify
```sql
-- Gateway should be gone
SELECT id FROM gateway WHERE id = '$GATEWAY_ID';
-- Should return 0 rows

-- Devices should have gatewayId = null
SELECT id, serial, "gatewayId" FROM device WHERE id IN ('<device-ids>');
```

### Expected result
- HTTP 204 No Content
- Gateway record deleted
- All previously assigned devices: `gatewayId IS NULL`

---

## Scenario 5: Device with gatewayId can still authenticate via MQTT directly

### Goal
Device with `gatewayId` set is no longer blocked from direct MQTT connection.

### Setup
```sql
-- Confirm device has gatewayId set and has a deviceToken
SELECT id, serial, "deviceToken", "gatewayId", status FROM device WHERE id = '$DEVICE_ID';
```

### Execute
```bash
# EMQX auth webhook (simulate what EMQX calls)
curl -s -X POST http://localhost:3000/api/emqx/auth \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$DEVICE_ID\",\"password\":\"<deviceToken>\"}" | jq
```

### Expected result
- Response: `{ "result": "allow" }` (was `deny` before this feature)

---

## Scenario 6: Gateway ACL — removed topics denied

### Goal
Gateway can no longer publish to `provision/new` or `gateway/{id}/devices/report`, and cannot subscribe to `provision/resp/+`.

### Setup
```sql
-- Get gateway mqttToken
SELECT id, "mqttToken" FROM gateway WHERE id = '$GATEWAY_ID';
```

### Execute
```bash
GW_TOKEN="<mqttToken>"

# Should be DENIED: publish provision/new
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GATEWAY_ID\",\"password\":\"$GW_TOKEN\",\"topic\":\"provision/new\",\"access\":2}" | jq

# Should be DENIED: publish gateway/{id}/devices/report
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GATEWAY_ID\",\"password\":\"$GW_TOKEN\",\"topic\":\"gateway/$GATEWAY_ID/devices/report\",\"access\":2}" | jq

# Should be DENIED: subscribe provision/resp/abc
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GATEWAY_ID\",\"password\":\"$GW_TOKEN\",\"topic\":\"provision/resp/abc\",\"access\":1}" | jq

# Should still be ALLOWED: publish provision/gateway/new
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GATEWAY_ID\",\"password\":\"$GW_TOKEN\",\"topic\":\"provision/gateway/new\",\"access\":2}" | jq
```

### Expected result
- `provision/new` publish → `deny`
- `gateway/{id}/devices/report` publish → `deny`
- `provision/resp/+` subscribe → `deny`
- `provision/gateway/new` publish → `allow`

---

## Scenario 7: Firmware OTA dual-channel

### Goal
OTA deploy to a device with `gatewayId` publishes to both `device/{id}/cmd` (WiFi) and `gateway/{gwId}/device-ota` (LoRa).

### Setup
Subscribe to both topics via MQTT client (e.g. MQTT Explorer or mosquitto_sub):
```bash
# Terminal 1 — WiFi channel
mosquitto_sub -h localhost -p 1883 -u "<user>" -P "<pass>" \
  -t "device/$DEVICE_ID/cmd" -v

# Terminal 2 — LoRa channel
mosquitto_sub -h localhost -p 1883 -u "<user>" -P "<pass>" \
  -t "gateway/$GATEWAY_ID/device-ota" -v
```

```sql
-- Get a firmware ID to deploy
SELECT id, version, "hardwareModel" FROM firmware LIMIT 5;
export FIRMWARE_ID="<id>"
```

### Execute
```bash
curl -s -X POST http://localhost:3000/api/firmware/$FIRMWARE_ID/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceIds\":[\"$DEVICE_ID\"]}" | jq
```

### Verify
```sql
-- Check firmware_update_log — status should be 'pending' or 'sent'
SELECT id, status, "deviceId", "firmwareVersion" FROM firmware_update_log
  WHERE "deviceId" = '$DEVICE_ID' ORDER BY "createdAt" DESC LIMIT 1;
```

### Expected result
- Both MQTT terminals receive a message
- Both payloads have identical structure: `{ deviceId, version, url, checksum, checksumAlgorithm, fileSize, ts }`
- `firmware_update_log.status = 'pending'`

---

## Edge Cases

### E1: Delete non-existent gateway
```bash
curl -s -X DELETE http://localhost:3000/api/gateways/non-existent-id \
  -H "Authorization: Bearer $TOKEN" -v
```
→ HTTP 404

### E2: Pair gateway with expired pairingToken
```bash
curl -s -X POST http://localhost:3000/api/provision/gateway/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pairingToken":"expired-token","farmId":"'"$FARM_ID"'"}' | jq
```
→ HTTP 400 `Pairing token expired`

### E3: Pair gateway with already-used pairingToken
Same as above but with a token marked `pairingTokenUsed = true`.
→ HTTP 400 `Pairing token already used`

### E4: Auth missing on gateway delete
```bash
curl -s -X DELETE http://localhost:3000/api/gateways/$GATEWAY_ID -v
```
→ HTTP 401

### E5: Firmware deploy to device without gateway (WiFi only)
```sql
-- Find a device with gatewayId = null
SELECT id FROM device WHERE "gatewayId" IS NULL AND status = 'paired' LIMIT 1;
```
Deploy OTA to that device — only `device/{id}/cmd` should receive the message, `gateway/*/device-ota` should NOT fire.

---

## Checklist

- [ ] Scenario 1: Gateway pair → farm devices bulk-assigned gatewayId
- [ ] Scenario 2: Device pair → auto-assigned farm gateway
- [ ] Scenario 3: Device pair on no-gateway farm → gatewayId null
- [ ] Scenario 4: Gateway delete → device.gatewayId bulk nulled
- [ ] Scenario 5: Device with gatewayId authenticates directly (MQTT auth allow)
- [ ] Scenario 6: Removed ACL topics denied; gateway/new still allowed
- [ ] Scenario 7: OTA dual-channel, unified payload
- [ ] E1: 404 on delete non-existent gateway
- [ ] E2: 400 expired pairingToken
- [ ] E3: 400 used pairingToken
- [ ] E4: 401 missing auth
- [ ] E5: WiFi-only OTA for device without gateway
