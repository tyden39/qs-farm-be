# Test Guide: Scoped Gateway Command Topic

**Feature:** Route device commands through `gateway/{gwId}/device/{deviceId}/cmd` when device has a `gatewayId` (LoRa mode); keep `device/{deviceId}/cmd` for WiFi-direct devices.
**Endpoints / Functions:**
- `POST /api/emqx/acl` — EMQX ACL webhook (broker calls this)
- `SyncService.sendCommandToDevice()` — triggered via WebSocket `sendCommand` event
- `DELETE /api/devices/:id` — triggers `factory_reset` routed to correct topic
**Date:** 2026-04-09

---

## Prerequisites

```bash
# Start stack
docker-compose up -d

# Get JWT access token
export TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.accessToken')

# Set gateway ID and device ID from your DB
export GW_ID="<gateway-uuid>"
export DEVICE_LORA="<device-uuid-with-gatewayId>"
export DEVICE_WIFI="<device-uuid-without-gatewayId>"

# Verify IDs
psql $DATABASE_URL -c "SELECT id, serial, \"gatewayId\" FROM device WHERE id IN ('$DEVICE_LORA', '$DEVICE_WIFI');"
```

---

## Test Scenario 1: EMQX ACL — Gateway denied `device/+/cmd` wildcard

### Goal
Verify that EMQX ACL now denies a gateway subscribing `device/+/cmd` (old wildcard, cross-tenant risk).

### Execute
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"device/+/cmd\",\"access\":1}" \
  | jq .
```

### Verify
- HTTP 200 with `{ "result": "deny" }`

### Expected result
- `result` = `"deny"` — gateway cannot subscribe the cross-tenant wildcard anymore

---

## Test Scenario 2: EMQX ACL — Gateway allowed scoped command topic

### Goal
Verify that a gateway can subscribe `gateway/{gwId}/device/+/cmd` (scoped to its own ID).

### Execute
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"gateway/$GW_ID/device/+/cmd\",\"access\":1}" \
  | jq .
```

### Verify
- HTTP 200 with `{ "result": "allow" }`

### Expected result
- `result` = `"allow"` — gateway can receive commands scoped to its own ID

---

## Test Scenario 3: EMQX ACL — Gateway denied another gateway's scoped topic

### Goal
Verify EMQX denies a gateway subscribing a different gateway's scoped command topic.

### Setup
```bash
export OTHER_GW_ID="<different-gateway-uuid>"
```

### Execute
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"gateway/$OTHER_GW_ID/device/+/cmd\",\"access\":1}" \
  | jq .
```

### Verify
- HTTP 200 with `{ "result": "deny" }`

### Expected result
- `result` = `"deny"` — gateway isolation enforced at broker level

---

## Test Scenario 4: LoRa device command — publishes to scoped topic

### Goal
Verify that sending a command to a LoRa-attached device (has `gatewayId`) publishes to `gateway/{gwId}/device/{deviceId}/cmd`.

### Setup
Subscribe to MQTT topics on EMQX to observe publish (use MQTT explorer or CLI):
```bash
# In a separate terminal — subscribe to both topics to detect which one is used
mosquitto_sub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "gateway/$GW_ID/device/+/cmd" \
  -t "device/$DEVICE_LORA/cmd" \
  -v &
```

### Execute
Send command via WebSocket (Socket.IO) to the server:
```bash
# Using wscat or any Socket.IO client
wscat -c "ws://localhost:3000/device?auth[token]=$TOKEN" \
  -x '{"event":"sendCommand","data":{"deviceId":"'"$DEVICE_LORA"'","command":"pump_on","params":{}}}'
```

Or trigger via HTTP if there's a REST endpoint that calls `sendCommandToDevice`.

### Verify
- MQTT message received on `gateway/$GW_ID/device/$DEVICE_LORA/cmd`
- **NOT** received on `device/$DEVICE_LORA/cmd`
- DB: command logged in `command_log` table

```sql
SELECT device_id, command, source, success, created_at
FROM command_log
WHERE device_id = '<DEVICE_LORA>'
ORDER BY created_at DESC
LIMIT 1;
```

### Expected result
- Message arrives on scoped gateway topic
- `command_log` row: `source = 'MANUAL'`, `success = true`

---

## Test Scenario 5: WiFi device command — publishes to direct topic

### Goal
Verify that a WiFi-direct device (`gatewayId = null`) still receives commands on `device/{deviceId}/cmd`.

### Setup
```bash
# Confirm device has no gatewayId
psql $DATABASE_URL -c "SELECT id, \"gatewayId\" FROM device WHERE id = '$DEVICE_WIFI';"

# Subscribe to WiFi device topic
mosquitto_sub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "device/$DEVICE_WIFI/cmd" -v &
```

### Execute
```bash
wscat -c "ws://localhost:3000/device?auth[token]=$TOKEN" \
  -x '{"event":"sendCommand","data":{"deviceId":"'"$DEVICE_WIFI"'","command":"pump_on","params":{}}}'
```

### Verify
- MQTT message received on `device/$DEVICE_WIFI/cmd`
- **NOT** on any gateway topic

```sql
SELECT device_id, command, source, success FROM command_log
WHERE device_id = '<DEVICE_WIFI>'
ORDER BY created_at DESC LIMIT 1;
```

### Expected result
- WiFi routing unchanged — backward compatible

---

## Test Scenario 6: Device delete — factory_reset routed correctly (LoRa device)

### Goal
Verify `DELETE /api/devices/:id` sends `factory_reset` through the scoped gateway topic for a LoRa device.

### Setup
```bash
# Subscribe to observe the factory_reset message
mosquitto_sub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "gateway/$GW_ID/device/+/cmd" -v &
```

### Execute
```bash
curl -s -X DELETE http://localhost:3000/api/devices/$DEVICE_LORA \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Verify
- MQTT message received on `gateway/$GW_ID/device/$DEVICE_LORA/cmd` with `command: "factory_reset"`
- Device record deleted from DB

```sql
SELECT id FROM device WHERE id = '<DEVICE_LORA>';
-- Should return 0 rows
```

### Expected result
- `factory_reset` delivered via scoped topic
- Device removed from DB

---

## Test Scenario 7: Threshold auto-command — LoRa device uses scoped topic

### Goal
Verify automated threshold commands (e.g., PUMP_ON triggered by sensor alert) use the scoped gateway topic.

### Setup
```bash
# Subscribe to observe automated commands
mosquitto_sub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "gateway/$GW_ID/device/+/cmd" -v &
```

Trigger a threshold violation by publishing a telemetry value that exceeds configured max/min:
```bash
mosquitto_pub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "device/$DEVICE_LORA/telemetry" \
  -m '{"temperature": 99, "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

*(Ensure the device has a CRITICAL temperature threshold configured.)*

### Verify
- MQTT message appears on `gateway/$GW_ID/device/$DEVICE_LORA/cmd`
- DB: automated command log entry

```sql
SELECT device_id, command, source, sensor_type, success, created_at
FROM command_log
WHERE device_id = '<DEVICE_LORA>' AND source = 'AUTOMATED'
ORDER BY created_at DESC LIMIT 1;
```

### Expected result
- `source = 'AUTOMATED'`, correct command, `success = true`
- Delivered via scoped gateway topic, not `device/{id}/cmd`

---

## Edge Cases

### Auth missing on ACL endpoint
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```
- Expected: HTTP 400 (validation error) or `{ "result": "deny" }`

### Non-existent gateway in ACL
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d '{"username":"gateway:00000000-0000-0000-0000-000000000000","topic":"gateway/00000000-0000-0000-0000-000000000000/device/+/cmd","access":1}' \
  | jq .
```
- Expected: `{ "result": "deny" }` (gateway not found in DB → auth fails before ACL)

### Gateway publish to scoped cmd topic (should be denied — server publishes, not gateway)
```bash
curl -s -X POST http://localhost:3000/api/emqx/acl \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gateway:$GW_ID\",\"topic\":\"gateway/$GW_ID/device/$DEVICE_LORA/cmd\",\"access\":2}" \
  | jq .
```
- Expected: `{ "result": "deny" }` — gateway publishes to `device/{id}/*` topics, not cmd

---

## Checklist

- [ ] Scenario 1: `device/+/cmd` wildcard denied for gateway
- [ ] Scenario 2: Scoped `gateway/{gwId}/device/+/cmd` allowed
- [ ] Scenario 3: Other gateway's scoped topic denied
- [ ] Scenario 4: LoRa device command routed to scoped gateway topic
- [ ] Scenario 5: WiFi device command still uses `device/{id}/cmd`
- [ ] Scenario 6: `factory_reset` on delete uses scoped topic for LoRa device
- [ ] Scenario 7: Auto threshold command uses scoped topic for LoRa device
- [ ] Edge case: non-existent gateway denied
- [ ] Edge case: gateway publish to cmd topic denied
