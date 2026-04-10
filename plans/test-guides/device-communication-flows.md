# Test Guide: IoT Device Communication Flows

**Feature:** Device provisioning, command dispatch, telemetry, heartbeat, and gateway-based communication with cascading deletion impacts

**Endpoints / Functions:**
- `POST /provision/pair` — Pair device with farm using pairing token
- `GET /provision/status/:serial` — Check device pairing status
- `POST /device/:id/command` — Send command to device
- `GET /device/:id/status` — Check device online status
- `POST /device/:id/unpair` — Unpair device from farm
- `DELETE /device/:id` — Delete device and cleanup associated data
- `DELETE /farm/:id` — Delete farm (cascades to devices)
- `DELETE /gateway/:id` — Delete gateway (unassigns devices)
- MQTT topics: `provision/new`, `provision/resp/{nonce}`, `device/{deviceId}/cmd`, `device/{deviceId}/telemetry`, `device/{deviceId}/status`, `device/{deviceId}/resp`

**Date:** 2026-04-09

---

## Prerequisites

### Environment Setup
```bash
# Ensure docker containers running
docker-compose up -d
# Check PostgreSQL (port 5432) and EMQX (MQTT 1883) are running

# Install dependencies
yarn install

# Start development server
yarn start:dev

# In another terminal, subscribe to MQTT for debugging
# mosquitto_sub -h localhost -p 1883 -t '#' (if mosquitto-clients installed)
# Or use EMQX web dashboard: http://localhost:18083
```

### Setup Test User & Farm
```bash
# Create test user (if not exists)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@farm.com",
    "password": "Test@123456",
    "firstName": "Test",
    "lastName": "User"
  }'

# Sign in and get tokens
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@farm.com",
    "password": "Test@123456"
  }')

export ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
export REFRESH_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.refresh_token')

# Create test farm
FARM_RESPONSE=$(curl -s -X POST http://localhost:3000/api/farm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Test Farm",
    "location": "Test Location",
    "area": 100
  }')

export FARM_ID=$(echo $FARM_RESPONSE | jq -r '.id')
export USER_ID=$(echo $TOKEN_RESPONSE | jq -r '.id')

# Create gateway (optional, for gateway tests)
GATEWAY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/gateway/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "serial": "GATEWAY-001",
    "pairingToken": "mock-token-12345",
    "farmId": "'$FARM_ID'"
  }')

export GATEWAY_ID=$(echo $GATEWAY_RESPONSE | jq -r '.gatewayId // empty')

echo "Setup complete: FARM_ID=$FARM_ID, USER_ID=$USER_ID, ACCESS_TOKEN=$ACCESS_TOKEN"
```

---

## Test Scenario 1: Device Provision Flow (MQTT → HTTP)

### Goal
Validate the complete device provisioning flow from device MQTT publish through pairing completion.

### Setup
No pre-setup needed. Device is not yet in the system.

### Execute

**Step 1: Device publishes provisioning request to MQTT**
```bash
# Simulate device sending provision/new message
mosquitto_pub -h localhost -p 1883 -t provision/new -m '{"serial":"DEV-PROV-001","hw":"v1.0","fw":"2.1.0","nonce":"nonce-12345"}'

# Or if mosquitto not available, simulate via Node script
node -e "
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');
client.on('connect', () => {
  client.publish('provision/new', JSON.stringify({
    serial: 'DEV-PROV-001',
    hw: 'v1.0',
    fw: '2.1.0',
    nonce: 'nonce-12345'
  }));
  console.log('Sent provision request');
  client.end();
});
"
```

**Step 2: Check device was created in PENDING status**
```bash
curl -s http://localhost:3000/api/provision/status/DEV-PROV-001 \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Step 3: App pairs device using pairing token**
```bash
# Get pairing token (from DB or logs if you see the token)
# For this test, assume token is visible in logs: "pairing token: XYZ"

PAIR_RESPONSE=$(curl -s -X POST http://localhost:3000/api/provision/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "serial": "DEV-PROV-001",
    "farmId": "'$FARM_ID'",
    "pairingToken": "TOKEN_FROM_LOGS_OR_LOGS"
  }')

export DEVICE_ID=$(echo $PAIR_RESPONSE | jq -r '.deviceId')
echo "Device paired: $DEVICE_ID"
```

### Verify

**Database Verification:**
```sql
-- Verify device is in PAIRED status
SELECT id, serial, status, "farmId", "deviceToken", "pairedAt" FROM device 
WHERE serial = 'DEV-PROV-001';

-- Verify pairing token marked as used
SELECT id, serial, token, used, "expiresAt" FROM pairing_token 
WHERE serial = 'DEV-PROV-001';

-- Verify no gateway assigned (if no gateway in farm)
SELECT id, serial, status, "farmId", "gatewayId" FROM device 
WHERE id = '$DEVICE_ID';
```

### Expected result
- Device created with PENDING status after step 1
- HTTP response in step 2 shows `status: "pending"`, `provisionedAt` timestamp set
- Device transitions to PAIRED status after step 3
- HTTP response shows `deviceToken` generated, `status: "paired"`, `pairedAt` timestamp set
- PairingToken record has `used: true`
- Device record has `farmId` and `deviceToken` populated
- MQTT set_owner command published to `device/{deviceId}/cmd` (observable in logs)

---

## Test Scenario 2: Send Command to Device (Direct/No Gateway)

### Goal
Validate command dispatch from server to device via MQTT, without gateway intermediary.

### Setup
```bash
# Use device from Scenario 1, or create new one
# Verify device is PAIRED and has no gateway assigned
curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '{status, gatewayId}'
```

### Execute

**Step 1: App sends command to device**
```bash
COMMAND_RESPONSE=$(curl -s -X POST http://localhost:3000/api/device/$DEVICE_ID/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "command": "start_pump",
    "params": {
      "duration": 300,
      "intensity": 80
    }
  }')

echo $COMMAND_RESPONSE | jq .
```

**Step 2: Capture MQTT message sent to device**
```bash
# In a separate terminal, monitor MQTT before sending command
mosquitto_sub -h localhost -p 1883 -t "device/*/cmd" -v

# Then send the command (Step 1) and observe message:
# device/DEV-PROV-001/cmd {"command":"start_pump","params":{...},"timestamp":"..."}
```

### Verify

**Application Verification:**
- HTTP response includes timestamp and confirmation command was queued

**MQTT Verification:**
- Message published to `device/{deviceId}/cmd` topic with exact command and params

**Database Verification:**
```sql
-- Verify device lastSeenAt not yet updated (update happens on telemetry/status, not command)
SELECT id, serial, "lastSeenAt" FROM device WHERE id = '$DEVICE_ID';
```

### Expected result
- HTTP 200 response with command metadata
- MQTT message with correct topic format: `device/{deviceId}/cmd`
- Message payload includes: `command`, `params`, `timestamp`
- Device marked as PAIRED with correct gatewayId (null in this case)
- Command dispatch succeeds regardless of device online status (best-effort, no ack required)

---

## Test Scenario 3: Device Telemetry Flow (MQTT → WebSocket Broadcast)

### Goal
Validate telemetry message flow: device publishes → server receives → broadcasts to WebSocket clients.

### Setup
```bash
# Device from Scenario 1/2 should exist and be PAIRED
# Open WebSocket connection (from another terminal or tool)

# Using websocat or wscat
# npm install -g wscat
# Set up WebSocket listener to receive device data
```

### Execute

**Step 1: Device publishes telemetry to MQTT**
```bash
mosquitto_pub -h localhost -p 1883 -t "device/$DEVICE_ID/telemetry" -m '{
  "sensorType": "soil-moisture",
  "value": 65.5,
  "unit": "%",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "pumpStatus": 1,
  "mode": "AUTOMATIC",
  "controlMode": "SMART"
}'
```

**Step 2: Open WebSocket and listen for broadcast**
```bash
# In another terminal
wscat -c "ws://localhost:3000/device?token=$ACCESS_TOKEN"

# When device publishes telemetry, you should see broadcast message:
# {
#   "type": "telemetry",
#   "sensorType": "soil-moisture",
#   "value": 65.5,
#   "unit": "%",
#   "timestamp": "...",
#   "pumpStatus": 1,
#   "receivedAt": "..."
# }
```

**Step 3: Verify lastSeenAt throttle (30s)**
```bash
# First telemetry: device.lastSeenAt updated
curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt'

# Wait < 30s, publish again → lastSeenAt NOT updated (throttled)
sleep 5
mosquitto_pub -h localhost -p 1883 -t "device/$DEVICE_ID/telemetry" -m '{"sensorType":"soil-moisture","value":68.0}'
curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt'

# Wait > 30s, publish again → lastSeenAt updated
sleep 26
mosquitto_pub -h localhost -p 1883 -t "device/$DEVICE_ID/telemetry" -m '{"sensorType":"soil-moisture","value":70.0}'
curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt'
```

### Verify

**WebSocket Verification:**
- Message received with correct format
- Includes both original telemetry fields and `receivedAt` server timestamp
- `type: "telemetry"` set correctly

**Database Verification:**
```sql
-- Verify device lastSeenAt updated (first telemetry only)
SELECT id, serial, "lastSeenAt" FROM device WHERE id = '$DEVICE_ID';

-- Verify telemetry recorded in sensor_data if sensor configured
SELECT id, "deviceId", "sensorConfigId", "value", "timestamp" FROM sensor_data 
WHERE "deviceId" = '$DEVICE_ID' ORDER BY "timestamp" DESC LIMIT 1;

-- Verify pump events emitted (check application logs for "pump.started" event)
-- grep "pump.started" logs
```

### Expected result
- WebSocket client receives broadcast immediately after device publishes
- `lastSeenAt` updated on first telemetry, then throttled for 30s
- After 30s cooldown, next telemetry updates `lastSeenAt` again
- Pump/fertilizer status changes trigger event emission (observable in logs)

---

## Test Scenario 4: Device Heartbeat (Silent Status Update)

### Goal
Validate heartbeat messages update lastSeenAt without broadcasting to clients.

### Setup
```bash
# Device from previous scenarios (PAIRED state)
```

### Execute

**Step 1: Device publishes heartbeat status**
```bash
mosquitto_pub -h localhost -p 1883 -t "device/$DEVICE_ID/status" -m '{
  "type": "heartbeat",
  "battery": 85,
  "signal": -65
}'
```

**Step 2: Monitor WebSocket (should receive NO message)**
```bash
# Open WebSocket connection in another terminal
wscat -c "ws://localhost:3000/device?token=$ACCESS_TOKEN"

# Publish heartbeat (Step 1) — no message should appear on WebSocket
# (contrast with Step 3 of Scenario 3, where telemetry broadcasts)
```

**Step 3: Verify lastSeenAt was updated**
```bash
BEFORE=$(curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')

sleep 2
mosquitto_pub -h localhost -p 1883 -t "device/$DEVICE_ID/status" -m '{"type":"heartbeat","battery":85}'

AFTER=$(curl -s http://localhost:3000/api/device/$DEVICE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')

# AFTER > BEFORE should be true
[ "$AFTER" != "$BEFORE" ] && echo "✓ lastSeenAt updated" || echo "✗ lastSeenAt not updated"
```

### Verify

**Database Verification:**
```sql
-- Verify device lastSeenAt updated
SELECT id, serial, "lastSeenAt" FROM device WHERE id = '$DEVICE_ID';

-- Verify NO status message logged to alert_log
SELECT COUNT(*) FROM alert_log WHERE "deviceId" = '$DEVICE_ID' AND type = 'heartbeat';
```

### Expected result
- `lastSeenAt` updated to current timestamp
- WebSocket receives NO broadcast message (unlike telemetry)
- No alert or status event logged
- Application logs show heartbeat processed silently

---

## Test Scenario 5: Device Communication With Gateway

### Goal
Validate that device connected to gateway receives commands via gateway routing.

### Setup
```bash
# Create gateway and pair it to farm
GATEWAY_PAIR=$(curl -s -X POST http://localhost:3000/api/gateway/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "serial": "GATEWAY-TEST-001",
    "pairingToken": "gateway-mock-token-001",
    "farmId": "'$FARM_ID'"
  }')

export GATEWAY_ID=$(echo $GATEWAY_PAIR | jq -r '.gatewayId')
echo "Gateway paired: $GATEWAY_ID"

# Verify gateway is PAIRED
curl -s http://localhost:3000/api/gateway/$GATEWAY_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '{status, farmId}'
```

### Execute

**Step 1: Provision device (similar to Scenario 1, but with gateway in farm)**
```bash
# Publish provision request
mosquitto_pub -h localhost -p 1883 -t provision/new -m '{
  "serial": "DEV-GATEWAY-001",
  "hw": "v1.0",
  "fw": "2.1.0",
  "nonce": "gw-nonce-001"
}'

# Pair device to farm (which has gateway)
PAIR=$(curl -s -X POST http://localhost:3000/api/provision/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "serial": "DEV-GATEWAY-001",
    "farmId": "'$FARM_ID'",
    "pairingToken": "TOKEN_FROM_LOGS"
  }')

export DEVICE_WITH_GW=$(echo $PAIR | jq -r '.deviceId')

# Verify device has gateway assigned
curl -s http://localhost:3000/api/device/$DEVICE_WITH_GW \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '{gatewayId, farmId}'
```

**Step 2: Send command to device (should route through gateway)**
```bash
curl -s -X POST http://localhost:3000/api/device/$DEVICE_WITH_GW/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "command": "stop_pump",
    "params": {}
  }' | jq .
```

**Step 3: Monitor MQTT for command with gateway routing**
```bash
# Listen to device command topic
mosquitto_sub -h localhost -p 1883 -t "device/$DEVICE_WITH_GW/cmd" -v

# Send command (Step 2) and observe message with gatewayId in payload
```

### Verify

**MQTT Message Verification:**
- Message published to `device/{deviceId}/cmd` (same topic)
- Payload includes `gatewayId: "$GATEWAY_ID"` (firmware uses this to route via gateway)

**Database Verification:**
```sql
-- Verify device has correct gatewayId
SELECT id, serial, "gatewayId", "farmId" FROM device WHERE id = '$DEVICE_WITH_GW';

-- Verify gateway is PAIRED and not DISABLED
SELECT id, serial, status FROM gateway WHERE id = '$GATEWAY_ID';
```

### Expected result
- Device automatically assigned to farm's gateway during pairing (via `gatewayId` in pairDevice)
- Command dispatch includes `gatewayId` in MQTT payload
- Device firmware uses `gatewayId` to determine if message routes through gateway or direct
- All other command/telemetry flows work identically to direct device

---

## Test Scenario 6: Deleting Gateway - Device Unassignment

### Goal
Validate that deleting a gateway unassigns all connected devices.

### Setup
```bash
# Use gateway and device from Scenario 5
# Verify device.gatewayId = GATEWAY_ID before deletion
curl -s http://localhost:3000/api/device/$DEVICE_WITH_GW \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.gatewayId'
```

### Execute

**Step 1: Delete gateway**
```bash
curl -s -X DELETE http://localhost:3000/api/gateway/$GATEWAY_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Step 2: Verify device is unassigned from gateway**
```bash
curl -s http://localhost:3000/api/device/$DEVICE_WITH_GW \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '{gatewayId, farmId, status}'
```

### Verify

**Database Verification:**
```sql
-- Verify device.gatewayId is now NULL
SELECT id, serial, "gatewayId" FROM device WHERE id = '$DEVICE_WITH_GW';

-- Verify device status unchanged (still PAIRED or ACTIVE)
SELECT id, serial, status FROM device WHERE id = '$DEVICE_WITH_GW';

-- Verify gateway is DISABLED or deleted
SELECT id, serial, status FROM gateway WHERE id = '$GATEWAY_ID';
```

### Expected result
- Device `gatewayId` set to NULL
- Device status remains PAIRED (not reverted)
- Device can still communicate with server (commands sent direct instead of via gateway)
- No data loss on device or gateway records (clean unassignment)

---

## Test Scenario 7: Delete Device - Cascading Data Cleanup

### Goal
Validate all related data deleted when device is removed.

### Setup
```bash
# Create a test device with complete history
# Send commands, telemetry, create sensor configs, thresholds
DEVICE=$(curl -s -X POST http://localhost:3000/api/device \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Test Device for Deletion",
    "imei": "TEST-IMEI-001",
    "serial": "TEST-SERIAL-001",
    "hardwareVersion": "v1.0",
    "farmId": "'$FARM_ID'"
  }')

export DEL_DEVICE=$(echo $DEVICE | jq -r '.id')

# Create sensor config for this device
curl -s -X POST http://localhost:3000/api/sensor/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "deviceId": "'$DEL_DEVICE'",
    "sensorType": "SOIL_MOISTURE",
    "name": "Test Sensor"
  }' > /dev/null

# Record current state
echo "Device to delete: $DEL_DEVICE"
```

### Execute

**Step 1: Delete device**
```bash
curl -s -X DELETE http://localhost:3000/api/device/$DEL_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Step 2: Verify device deleted**
```bash
# Should return 404
curl -s -X GET http://localhost:3000/api/device/$DEL_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.statusCode // "Device found (should be 404)"'
```

### Verify

**Database Verification:**
```sql
-- Verify device deleted
SELECT COUNT(*) FROM device WHERE id = '$DEL_DEVICE';

-- Verify sensor_config deleted (cascaded)
SELECT COUNT(*) FROM sensor_config WHERE "deviceId" = '$DEL_DEVICE';

-- Verify sensor_data deleted (cascaded)
SELECT COUNT(*) FROM sensor_data WHERE "deviceId" = '$DEL_DEVICE';

-- Verify alert_log deleted (cascaded)
SELECT COUNT(*) FROM alert_log WHERE "deviceId" = '$DEL_DEVICE';

-- Verify command_log deleted (cascaded)
SELECT COUNT(*) FROM command_log WHERE "deviceId" = '$DEL_DEVICE';

-- Verify device_schedule deleted (cascaded)
SELECT COUNT(*) FROM device_schedule WHERE "deviceId" = '$DEL_DEVICE';

-- Verify pairing_token deleted (cascaded, if serial existed)
SELECT COUNT(*) FROM pairing_token WHERE serial = 'TEST-SERIAL-001';
```

### Expected result
- Device record removed from database
- All related records deleted via cascade (sensor_config, sensor_data, alert_log, command_log, device_schedule)
- Pairing tokens for that device's serial also deleted
- HTTP API returns 404 for device queries
- No orphaned records remain

---

## Test Scenario 8: Delete Farm - Cascading Device Deletion

### Goal
Validate that deleting a farm deletes all devices in that farm and their associated data.

### Setup
```bash
# Create new farm with multiple devices
NEW_FARM=$(curl -s -X POST http://localhost:3000/api/farm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Farm for Deletion Test",
    "location": "Test Location",
    "area": 50
  }')

export DEL_FARM=$(echo $NEW_FARM | jq -r '.id')

# Create 3 devices in this farm
for i in 1 2 3; do
  curl -s -X POST http://localhost:3000/api/device \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d '{
      "name": "Device '$i' for Farm Deletion",
      "imei": "TEST-DEL-IMEI-'$i'",
      "serial": "TEST-DEL-SERIAL-'$i'",
      "farmId": "'$DEL_FARM'"
    }' > /dev/null
done

# Verify devices created
curl -s http://localhost:3000/api/device?farmId=$DEL_FARM \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.[] | .id' > /tmp/device_ids.txt

echo "Farm to delete: $DEL_FARM"
echo "Device count: $(wc -l < /tmp/device_ids.txt)"
```

### Execute

**Step 1: Delete farm**
```bash
curl -s -X DELETE http://localhost:3000/api/farm/$DEL_FARM \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Step 2: Verify farm and all devices deleted**
```bash
# Should return 404
curl -s -X GET http://localhost:3000/api/farm/$DEL_FARM \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.statusCode // "Farm found"'

# Verify no devices for this farm
curl -s http://localhost:3000/api/device?farmId=$DEL_FARM \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.[] | .id | length' 
```

### Verify

**Database Verification:**
```sql
-- Verify farm deleted
SELECT COUNT(*) FROM farm WHERE id = '$DEL_FARM';

-- Verify all devices deleted (should be 0)
SELECT COUNT(*) FROM device WHERE "farmId" = '$DEL_FARM';

-- Verify all sensor configs deleted for those devices
-- (Use device IDs from /tmp/device_ids.txt)
SELECT COUNT(*) FROM sensor_config 
WHERE "deviceId" IN (
  SELECT id FROM device WHERE "farmId" = '$DEL_FARM'
);
```

### Expected result
- Farm record deleted
- All devices in farm deleted
- All related data (sensor_config, sensor_data, alerts, commands, schedules) deleted via cascade
- Querying for devices in deleted farm returns empty list
- HTTP API returns 404 for farm queries

---

## Test Scenario 9: Device Response to Command

### Goal
Validate device response message handling and command logging.

### Setup
```bash
# Use device from previous scenarios (must be PAIRED and online)
export RESP_DEVICE=$DEVICE_ID  # or use another existing device
```

### Execute

**Step 1: Send command**
```bash
CMD=$(curl -s -X POST http://localhost:3000/api/device/$RESP_DEVICE/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "command": "read_sensor",
    "params": {"sensor": "moisture"}
  }')

echo "Command sent: $CMD" | jq .
```

**Step 2: Simulate device response via MQTT**
```bash
mosquitto_pub -h localhost -p 1883 -t "device/$RESP_DEVICE/resp" -m '{
  "requestId": "req-12345",
  "command": "read_sensor",
  "status": "success",
  "result": {
    "sensor": "moisture",
    "value": 72.3,
    "unit": "%"
  },
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
}'
```

**Step 3: WebSocket listens for response**
```bash
# Open WebSocket connection
wscat -c "ws://localhost:3000/device?token=$ACCESS_TOKEN"

# Device publishes response (Step 2) — should broadcast to connected clients
# Message should include: requestId, command, status, result, timestamp
```

### Verify

**WebSocket Verification:**
- Message received with `type: "response"` or similar indicator
- Includes all fields from device response

**Database Verification:**
```sql
-- Verify command_log entry created (if auto-logged)
SELECT id, "deviceId", "command", "status", "result", "createdAt" 
FROM command_log 
WHERE "deviceId" = '$RESP_DEVICE' 
ORDER BY "createdAt" DESC LIMIT 1;
```

### Expected result
- WebSocket client receives response message
- Response includes original command context (requestId, command name)
- Response status and result from device are forwarded
- Command is logged in command_log table with status and result

---

## Test Scenario 10: Device Last Seen At Tracking Across Communication Types

### Goal
Validate `lastSeenAt` is correctly updated for different message types and respects throttling.

### Setup
```bash
export TRACK_DEVICE=$DEVICE_ID

# Record baseline
BASELINE=$(curl -s http://localhost:3000/api/device/$TRACK_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')

echo "Baseline lastSeenAt: $BASELINE"
```

### Execute

**Step 1: Publish telemetry**
```bash
sleep 2
mosquitto_pub -h localhost -p 1883 -t "device/$TRACK_DEVICE/telemetry" -m '{"sensorType":"temp","value":25}'
T1=$(curl -s http://localhost:3000/api/device/$TRACK_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')
echo "After telemetry: $T1"
```

**Step 2: Publish heartbeat immediately (should be throttled)**
```bash
sleep 1
mosquitto_pub -h localhost -p 1883 -t "device/$TRACK_DEVICE/status" -m '{"type":"heartbeat","battery":85}'
T2=$(curl -s http://localhost:3000/api/device/$TRACK_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')
echo "After heartbeat (< 30s): $T2"
[ "$T1" == "$T2" ] && echo "✓ Correctly throttled" || echo "✗ Should not update within 30s"
```

**Step 3: Wait 31 seconds and publish heartbeat again**
```bash
echo "Waiting 31 seconds for throttle cooldown..."
sleep 31
mosquitto_pub -h localhost -p 1883 -t "device/$TRACK_DEVICE/status" -m '{"type":"heartbeat","battery":80}'
T3=$(curl -s http://localhost:3000/api/device/$TRACK_DEVICE \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.lastSeenAt')
echo "After heartbeat (> 30s): $T3"
[ "$T3" != "$T2" ] && echo "✓ Updated after cooldown" || echo "✗ Should update after 30s"
```

### Verify

**Timeline Verification:**
```
T1: telemetry → lastSeenAt updated
T2: heartbeat (< 30s) → lastSeenAt NOT updated (throttled)
T3: heartbeat (> 30s) → lastSeenAt updated
```

### Expected result
- `lastSeenAt` updates on telemetry
- Subsequent updates within 30s are throttled (not updated)
- After 30s cooldown, next message updates `lastSeenAt` again
- Timestamp values show increasing time with proper throttle behavior

---

## Checklist

### Scenario 1: Device Provision
- [ ] Device created in PENDING status on MQTT message
- [ ] Pairing token generated and published to provision/resp topic
- [ ] Device transitions to PAIRED on HTTP pair endpoint
- [ ] device_token generated and stored
- [ ] set_owner command published to device
- [ ] Pairing token marked as used in database

### Scenario 2: Send Command
- [ ] HTTP endpoint returns 200 immediately
- [ ] Command message published to device/{deviceId}/cmd MQTT topic
- [ ] Message includes exact command and params
- [ ] Works regardless of device online status (best-effort)

### Scenario 3: Telemetry
- [ ] Telemetry message received from device MQTT
- [ ] Broadcasted to all connected WebSocket clients
- [ ] lastSeenAt updated on database (first telemetry only)
- [ ] Throttle prevents updates within 30s of previous telemetry
- [ ] Pump/fertilizer events emitted and logged

### Scenario 4: Heartbeat
- [ ] Heartbeat message received from device MQTT
- [ ] lastSeenAt updated without WebSocket broadcast
- [ ] No event emission or logging for heartbeat

### Scenario 5: Gateway Communication
- [ ] Device auto-assigned to farm's gateway on pair
- [ ] gatewayId included in command MQTT payload
- [ ] Command dispatch works identically to direct device

### Scenario 6: Delete Gateway
- [ ] Devices unassigned from gateway (gatewayId → NULL)
- [ ] Device status remains PAIRED
- [ ] Gateway status changed to DISABLED or deleted
- [ ] No data loss

### Scenario 7: Delete Device
- [ ] Device record deleted
- [ ] sensor_config cascaded deleted
- [ ] sensor_data cascaded deleted
- [ ] alert_log cascaded deleted
- [ ] command_log cascaded deleted
- [ ] device_schedule cascaded deleted
- [ ] pairing_token cascaded deleted

### Scenario 8: Delete Farm
- [ ] Farm record deleted
- [ ] All devices in farm deleted
- [ ] All related data for those devices deleted

### Scenario 9: Device Response
- [ ] Device response message received from MQTT
- [ ] Response broadcasted to WebSocket clients
- [ ] Command logged in command_log

### Scenario 10: LastSeenAt Tracking
- [ ] Telemetry updates lastSeenAt
- [ ] Heartbeat updates lastSeenAt (not throttled for heartbeat, but still respects recent updates)
- [ ] Throttle prevents updates within 30s window
- [ ] After cooldown, updates resume normally

