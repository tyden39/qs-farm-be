# Test Guide: LoRa Gateway + Device Heartbeat

**Feature:** LoRa gateway transparent layer + device online status via lastSeenAt/heartbeat
**Endpoints / Functions:**
- `GET /api/device/:id/status`
- `POST /api/provision/gateway/pair`
- `GET /api/gateways?farmId=`
- `GET /api/gateways/:id`
- `GET /api/gateways/:id/status`
- EMQX webhooks: `POST /api/emqx/auth`, `POST /api/emqx/acl`
- MQTT topics: `device/{id}/status`, `provision/gateway/new`, `gateway/{id}/status`
- WebSocket event: `requestFirmwareUpdate` with `gatewayIds`

**Date:** 2026-04-07

---

## Prerequisites

```bash
# Start services
docker-compose up -d

# Env vars
export BASE=http://localhost:3000/api
export TOKEN=""          # JWT access token from POST /api/auth/login
export FARM_ID=""        # existing farm UUID
export DEVICE_ID=""      # existing paired device UUID
export GW_SERIAL="GW-ESP32-001"
```

### Get auth token
```bash
export TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password"}' \
  | jq -r '.accessToken')
```

---

## Scenario 1: Device offline when no heartbeat received

### Goal
`GET /device/:id/status` returns `online: false` when device has never sent a heartbeat.

### Setup
```sql
-- Reset lastSeenAt to NULL for test device
UPDATE device SET last_seen_at = NULL WHERE id = '<DEVICE_ID>';
```

### Execute
```bash
curl -s -X GET "$BASE/device/$DEVICE_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 200
- `online: false`

```sql
SELECT id, last_seen_at FROM device WHERE id = '<DEVICE_ID>';
-- last_seen_at should be NULL
```

### Expected result
- `{ "deviceId": "...", "online": false, "status": "paired", ... }`

---

## Scenario 2: Device comes online via telemetry (MQTT)

### Goal
Sending a telemetry MQTT message updates `lastSeenAt` and device reports online.

### Setup
```sql
UPDATE device SET last_seen_at = NULL WHERE id = '<DEVICE_ID>';
```

### Execute
```bash
# Publish telemetry via MQTT (requires mosquitto_pub with device credentials)
mosquitto_pub -h localhost -p 1883 \
  -u "device:<DEVICE_ID>" -P "<DEVICE_TOKEN>" \
  -t "device/<DEVICE_ID>/telemetry" \
  -m '{"temperature":25.5,"humidity":80}'

sleep 1

curl -s -X GET "$BASE/device/$DEVICE_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 200, `online: true`

```sql
SELECT id, last_seen_at FROM device WHERE id = '<DEVICE_ID>';
-- last_seen_at should be within the last 5 seconds
SELECT NOW() - last_seen_at AS age FROM device WHERE id = '<DEVICE_ID>';
```

### Expected result
- `online: true`, `lastSeenAt` present in response (if returned)

---

## Scenario 3: Heartbeat updates lastSeenAt silently (no WebSocket broadcast)

### Goal
Heartbeat message on `device/{id}/status` updates `lastSeenAt` but does NOT broadcast to WebSocket.

### Setup
Connect a WebSocket client to `/device` namespace and subscribe to the device room. Then publish heartbeat.

### Execute
```bash
mosquitto_pub -h localhost -p 1883 \
  -u "device:<DEVICE_ID>" -P "<DEVICE_TOKEN>" \
  -t "device/<DEVICE_ID>/status" \
  -m '{"type":"heartbeat","ts":12345}'

sleep 1

curl -s -X GET "$BASE/device/$DEVICE_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.online'
```

### Verify
- `online: true`
- WebSocket client does NOT receive a `deviceStatus` event

```sql
SELECT last_seen_at FROM device WHERE id = '<DEVICE_ID>';
-- updated within the last 5 seconds
```

### Expected result
- DB updated, no WebSocket event emitted for heartbeat

---

## Scenario 4: LWT sets device offline immediately

### Goal
`device/{id}/status { reason: "lwt" }` sets `lastSeenAt = null`, device reports offline.

### Setup
```sql
UPDATE device SET last_seen_at = NOW() WHERE id = '<DEVICE_ID>';
```

### Execute
```bash
mosquitto_pub -h localhost -p 1883 \
  -u "device:<DEVICE_ID>" -P "<DEVICE_TOKEN>" \
  -t "device/<DEVICE_ID>/status" \
  -m '{"reason":"lwt"}'

sleep 1

curl -s -X GET "$BASE/device/$DEVICE_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.online'
```

### Verify
- `online: false`

```sql
SELECT last_seen_at FROM device WHERE id = '<DEVICE_ID>';
-- NULL
```

### Expected result
- `online: false`, WebSocket clients receive `deviceStatus` event with LWT payload

---

## Scenario 5: Device goes stale after 90 seconds

### Goal
`isDeviceOnline` returns `false` if `lastSeenAt` is older than 90 seconds.

### Setup
```sql
UPDATE device SET last_seen_at = NOW() - INTERVAL '91 seconds' WHERE id = '<DEVICE_ID>';
```

### Execute
```bash
curl -s -X GET "$BASE/device/$DEVICE_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.online'
```

### Verify
- `online: false`

### Expected result
- `online: false` (stale heartbeat)

---

## Scenario 6: Gateway provision flow (MQTT → pairingToken)

### Goal
Gateway publishes to `provision/gateway/new` → server creates Gateway record and publishes pairingToken.

### Execute
```bash
# Subscribe to receive the pairingToken response (use a separate terminal)
mosquitto_sub -h localhost -p 1883 -t "provision/gateway/resp/#" -v &

# Gateway publishes provision request (anonymous or with temp credentials)
mosquitto_pub -h localhost -p 1883 \
  -t "provision/gateway/new" \
  -m "{\"serial\":\"$GW_SERIAL\",\"hw\":\"1.0\",\"nonce\":\"test-nonce-001\"}"

sleep 2
```

### Verify
- `provision/gateway/resp/test-nonce-001` receives `{ "pairingToken": "..." }`

```sql
SELECT id, serial, status, pairing_token, nonce, pairing_token_used
FROM gateway WHERE serial = 'GW-ESP32-001';
-- status = 'pending', pairing_token NOT NULL, nonce = 'test-nonce-001'
```

### Expected result
- Gateway record created with `status=pending`
- pairingToken published back on the nonce topic

---

## Scenario 7: App pairs gateway with farm

### Goal
`POST /provision/gateway/pair` transitions gateway to `paired` and publishes `{gatewayId, mqttToken}`.

### Setup
```bash
# Get pairingToken from Scenario 6
export PAIRING_TOKEN="<token-from-scenario-6>"
```

### Execute
```bash
# Subscribe to receive gateway credentials
mosquitto_sub -h localhost -p 1883 -t "provision/gateway/resp/test-nonce-001" -v &

curl -s -X POST "$BASE/provision/gateway/pair" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pairingToken\":\"$PAIRING_TOKEN\",\"farmId\":\"$FARM_ID\"}" | jq
```

### Verify
- HTTP 200, response contains `{ "gatewayId": "...", "mqttToken": "..." }`
- MQTT response published with gatewayId + mqttToken

```sql
SELECT id, serial, status, farm_id, mqtt_token, pairing_token_used, paired_at
FROM gateway WHERE serial = 'GW-ESP32-001';
-- status = 'paired', farm_id = FARM_ID, pairing_token_used = true
```

### Expected result
- Gateway status = `paired`, farmId set, mqttToken generated

---

## Scenario 8: Gateway list by farm

### Goal
`GET /gateways?farmId=` returns gateways belonging to a farm.

### Execute
```bash
curl -s -X GET "$BASE/gateways?farmId=$FARM_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 200, array containing the paired gateway

### Expected result
- `[{ "id": "...", "serial": "GW-ESP32-001", "status": "paired", ... }]`

---

## Scenario 9: Gateway heartbeat → online status

### Goal
`gateway/{id}/status { type: "heartbeat" }` updates `lastSeenAt`, `GET /gateways/:id/status` returns `online: true`.

### Setup
```bash
# Get gatewayId from Scenario 7
export GW_ID="<gateway-id>"
export GW_MQTT_TOKEN="<mqtt-token>"

# Reset lastSeenAt
# (do via SQL or rely on null state after pair)
```

```sql
UPDATE gateway SET last_seen_at = NULL WHERE id = '<GW_ID>';
```

### Execute
```bash
mosquitto_pub -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "$GW_MQTT_TOKEN" \
  -t "gateway/$GW_ID/status" \
  -m '{"type":"heartbeat","fw":"1.0.0","ts":12345}'

sleep 1

curl -s -X GET "$BASE/gateways/$GW_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 200, `online: true`, `firmwareVersion: "1.0.0"`

```sql
SELECT last_seen_at, firmware_version FROM gateway WHERE id = '<GW_ID>';
-- last_seen_at recent, firmware_version = '1.0.0'
```

### Expected result
- `{ "online": true, "firmwareVersion": "1.0.0", ... }`

---

## Scenario 10: Gateway LWT → offline

### Goal
`gateway/{id}/status { reason: "lwt" }` clears `lastSeenAt`, gateway reports offline.

### Setup
```sql
UPDATE gateway SET last_seen_at = NOW() WHERE id = '<GW_ID>';
```

### Execute
```bash
mosquitto_pub -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "$GW_MQTT_TOKEN" \
  -t "gateway/$GW_ID/status" \
  -m '{"reason":"lwt"}'

sleep 1

curl -s -X GET "$BASE/gateways/$GW_ID/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.online'
```

### Verify
- `online: false`

```sql
SELECT last_seen_at FROM gateway WHERE id = '<GW_ID>';
-- NULL
```

---

## Scenario 11: EMQX gateway authentication

### Goal
Gateway authenticates with `gateway:{gwId}` + `mqttToken` → allowed. Wrong token → denied.

### Execute
```bash
# Correct credentials → 200 OK
curl -s -X POST "$BASE/emqx/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"gateway:$GW_ID\",\"password\":\"$GW_MQTT_TOKEN\"}" | jq

# Wrong password → 200 false
curl -s -X POST "$BASE/emqx/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"gateway:$GW_ID\",\"password\":\"wrongtoken\"}" | jq
```

### Verify
- Correct credentials: `true`
- Wrong password: `false`

### Expected result
- EMQX auth respects mqttToken comparison

---

## Scenario 12: EMQX gateway ACL — publish device telemetry

### Goal
Gateway can publish to `device/+/telemetry` (ACL pass).

### Execute
```bash
# Publish ACL check (access=2 means publish)
curl -s -X POST "$BASE/emqx/acl" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"device/abc/telemetry\",\"access\":2}" | jq

# Publish to disallowed topic
curl -s -X POST "$BASE/emqx/acl" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"user/123/notifications\",\"access\":2}" | jq
```

### Verify
- `device/abc/telemetry` publish → `true`
- `user/123/notifications` publish → `false`

---

## Scenario 13: Gateway OTA via WebSocket

### Goal
Admin sends `requestFirmwareUpdate { gatewayIds: [...] }` → server publishes `gateway/{id}/ota`.

### Setup
```bash
# Upload a firmware binary first
export FW_ID=$(curl -s -X POST "$BASE/firmware/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.bin" \
  -F "version=2.0.0" \
  -F "hardwareModel=ESP32-GW" | jq -r '.id')

# Subscribe to receive OTA command
mosquitto_sub -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "$GW_MQTT_TOKEN" \
  -t "gateway/$GW_ID/ota" -v &
```

### Execute (WebSocket)
```javascript
// Connect to ws://localhost:3000/device with JWT
socket.emit('requestFirmwareUpdate', {
  firmwareId: '<FW_ID>',
  gatewayIds: ['<GW_ID>']
});
```

### Verify
- MQTT topic `gateway/{GW_ID}/ota` receives `{ url, checksum, version }`

```sql
SELECT gateway_id, firmware_version, status FROM firmware_update_log
WHERE gateway_id = '<GW_ID>'
ORDER BY created_at DESC LIMIT 1;
-- status = 'pending'
```

### Expected result
- OTA payload published, log entry created with `gatewayId` set

---

## Edge Cases

### E1: Pair with invalid token
```bash
curl -s -X POST "$BASE/provision/gateway/pair" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pairingToken":"invalid-token","farmId":"'$FARM_ID'"}' | jq '.statusCode'
# Expected: 404
```

### E2: Pair with already-used token
```bash
# Re-run the same valid pairingToken from Scenario 7
# Expected: 400 "Pairing token already used"
```

### E3: Get non-existent gateway
```bash
curl -s -X GET "$BASE/gateways/00000000-0000-0000-0000-000000000000/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.statusCode'
# Expected: 404
```

### E4: Device status without auth
```bash
curl -s -X GET "$BASE/device/$DEVICE_ID/status" | jq '.statusCode'
# Expected: 401
```

### E5: Throttle — lastSeenAt not updated on repeated telemetry within 30s
```bash
# Send two telemetry messages < 30s apart
mosquitto_pub ... -m '{"temperature":25}' ; sleep 5
mosquitto_pub ... -m '{"temperature":26}'

# Check DB — last_seen_at should reflect first message time, not second
SELECT last_seen_at FROM device WHERE id = '<DEVICE_ID>';
```

### E6: Gateway device-OTA routing — device with gatewayId uses device-ota topic
```sql
-- Set device's gatewayId
UPDATE device SET gateway_id = '<GW_ID>' WHERE id = '<DEVICE_ID>';
```

```bash
# Subscribe to device-ota
mosquitto_sub -h localhost -p 1883 \
  -u "gateway:$GW_ID" -P "$GW_MQTT_TOKEN" \
  -t "gateway/$GW_ID/device-ota" -v &

# Trigger standard device OTA via REST
curl -s -X POST "$BASE/firmware/$FW_ID/deploy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deviceIds\":[\"$DEVICE_ID\"]}" | jq
```
- Expected: `gateway/{GW_ID}/device-ota` receives payload with `deviceId`

---

## Checklist

- [ ] Scenario 1: Device offline when lastSeenAt is NULL
- [ ] Scenario 2: Telemetry updates lastSeenAt → online: true
- [ ] Scenario 3: Heartbeat silent (no WS broadcast, DB updated)
- [ ] Scenario 4: LWT sets lastSeenAt = NULL → offline
- [ ] Scenario 5: Stale lastSeenAt (> 90s) → offline
- [ ] Scenario 6: Gateway provision request → pairingToken published
- [ ] Scenario 7: App pairs gateway → status=paired, mqttToken published
- [ ] Scenario 8: GET /gateways?farmId returns gateways
- [ ] Scenario 9: Gateway heartbeat → online: true, firmwareVersion updated
- [ ] Scenario 10: Gateway LWT → online: false
- [ ] Scenario 11: EMQX gateway auth (correct/wrong token)
- [ ] Scenario 12: EMQX gateway ACL (publish allowed/denied)
- [ ] Scenario 13: Gateway OTA via WebSocket requestFirmwareUpdate
- [ ] E1: Invalid pairingToken → 404
- [ ] E2: Already-used pairingToken → 400
- [ ] E3: Non-existent gateway → 404
- [ ] E4: Unauthenticated request → 401
- [ ] E5: Telemetry throttle (30s window)
- [ ] E6: Device with gatewayId routes OTA via device-ota topic
