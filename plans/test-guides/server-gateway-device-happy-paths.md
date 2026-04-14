# Test Guide: Server ↔ Gateway ↔ Device Communication (Happy Paths)

**Feature:** End-to-end verification of all MQTT + REST communication flows between server, gateway, and device. Happy case only — no error/edge scenarios.

**Scope:**
- Device provisioning & pairing (direct WiFi)
- Gateway provisioning & pairing
- Gateway-mediated device commands (LoRa fallback)
- Direct WiFi device commands
- Heartbeat, LWT, telemetry, command response flows

**Endpoints / Topics involved:**
- REST: `POST /provision/pair`, `POST /provision/gateway/pair`, `GET /gateways/:id/status`, `GET /provision/status/:serial`
- MQTT (device → server): `provision/new`, `device/+/status`, `device/+/telemetry`, `device/+/resp`
- MQTT (gateway → server): `provision/gateway/new`, `gateway/+/status`
- MQTT (server → device/gateway): `provision/resp/{nonce}`, `provision/gateway/resp/{nonce}`, `device/{deviceId}/cmd`, `gateway/{gatewayId}/device/{deviceId}/cmd`

**Date:** 2026-04-11

**Source of truth:**
- [src/device/mqtt/mqtt.service.ts](src/device/mqtt/mqtt.service.ts)
- [src/device/sync/sync.service.ts](src/device/sync/sync.service.ts)
- [src/provision/provision.service.ts](src/provision/provision.service.ts)
- [src/gateway/gateway.service.ts](src/gateway/gateway.service.ts)

---

## Prerequisites

### Environment
```bash
# 1. Start infra
docker-compose up -d    # PostgreSQL:5432, EMQX:1883, dashboard:18083

# 2. Start NestJS
yarn start:dev

# 3. Subscribe to ALL MQTT traffic in a second terminal
mosquitto_sub -h localhost -p 1883 -v -t '#'
# Or EMQX dashboard → WebSocket → subscribe `#`
```

### Reusable env vars
```bash
export API=http://localhost:3000
export MQTT_HOST=localhost
export MQTT_PORT=1883

# Sign in and export token (user must exist)
export TOKEN=$(curl -s -X POST $API/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq -r '.accessToken')

# Create farm and export id
export FARM_ID=$(curl -s -X POST $API/farm \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Happy Path Farm","location":"Test"}' \
  | jq -r '.id')
```

### DB shortcut
```bash
alias psqlc='docker exec -i qs-farm-postgres psql -U postgres -d qs_farm'
```

---

## Flow Map

```
┌─────────┐                     ┌──────────┐                  ┌──────┐
│ Device  │◀──── MQTT ─────────▶│  EMQX    │◀──── MQTT ──────▶│ NestJS│
└─────────┘                     └──────────┘                  └──────┘
     ▲                                                             │
     │                                                             │
     └── gateway/{gw}/device/{id}/cmd (LoRa) ─── Gateway ◀── MQTT ──┘
                                                    ▲
                                                    │ gateway/{gw}/status
                                                    │ provision/gateway/new
```

**Two command paths:**
1. Device has `gatewayId=null` → `device/{deviceId}/cmd` (WiFi direct)
2. Device has `gatewayId` set → `gateway/{gatewayId}/device/{deviceId}/cmd` with `mac` field (LoRa via gateway)

---

## Scenario 1: Device Provisioning (MQTT ingress)

### Goal
Device publishes to `provision/new`; server creates Device(PENDING) + PairingToken and replies on `provision/resp/{nonce}`.

### Setup
None.

### Execute
```bash
# Publish provisioning request as device
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT -t 'provision/new' -m '{
  "serial":"SN-HP-001",
  "mac":"AA:BB:CC:DD:EE:01",
  "hw":"rev1",
  "fw":"1.0.0",
  "nonce":"nonce-dev-001"
}'
```

Listen for the response in the background first:
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -t 'provision/resp/nonce-dev-001' -C 1
```

### Verify
- Subscriber output contains `{"status":"provisioned","deviceId":"...","pairingToken":"..."}`
- DB rows created:
```sql
-- Device in PENDING
SELECT id, serial, mac, status, "firmwareVersion", "provisionedAt"
FROM device WHERE serial='SN-HP-001';
-- Expect: 1 row, status=PENDING, mac='AA:BB:CC:DD:EE:01'

-- Pairing token issued
SELECT serial, used, "expiresAt" > NOW() AS active
FROM pairing_token WHERE serial='SN-HP-001';
-- Expect: used=false, active=true
```

### Expected result
- Server log: `Device provisioned: SN-HP-001 (...)`
- `provision/resp/nonce-dev-001` published within ~1s
- Pairing token valid for 24h

```bash
export DEVICE_SERIAL=SN-HP-001
export DEVICE_PAIRING_TOKEN=<copy-from-mqtt-resp>
export DEVICE_ID=$(psqlc -tAc "SELECT id FROM device WHERE serial='SN-HP-001'")
```

---

## Scenario 2: Device Pairing via REST (app flow)

### Goal
App calls `POST /provision/pair` → device gets `farmId` + `deviceToken` + `status=PAIRED`; server publishes `set_owner` over MQTT to `device/{deviceId}/cmd`. Pairing token is marked `used=true`.

### Setup
Prereq: Scenario 1 passed. Subscribe to the device cmd topic first:
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -v -t "device/$DEVICE_ID/cmd" &
```

### Execute
```bash
curl -s -X POST $API/provision/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"serial\":\"$DEVICE_SERIAL\",
    \"farmId\":\"$FARM_ID\",
    \"pairingToken\":\"$DEVICE_PAIRING_TOKEN\"
  }" | jq
```

### Verify
- HTTP 200/201 with `{ deviceId, serial, deviceToken, status:"PAIRED" }`
- MQTT subscriber sees: `{"cmd":"set_owner","ownerId":"...","farmId":"...","token":"...","gatewayId":null,...}`
- DB:
```sql
SELECT status, "farmId", "gatewayId", "deviceToken" IS NOT NULL AS has_token, "pairedAt"
FROM device WHERE id='$DEVICE_ID';
-- Expect: status=PAIRED, farmId=$FARM_ID, gatewayId=NULL (no gateway yet), has_token=t

SELECT used FROM pairing_token WHERE serial='$DEVICE_SERIAL';
-- Expect: used=true
```

### Expected result
- Device now in `PAIRED` state with no gateway (since none provisioned yet)
- Commands for this device will currently go via WiFi direct topic

---

## Scenario 3: Gateway Provisioning (MQTT ingress)

### Goal
Gateway publishes to `provision/gateway/new` → server creates Gateway(PENDING) with pairingToken and replies on `provision/gateway/resp/{nonce}`.

### Setup
Subscribe to response topic:
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -t 'provision/gateway/resp/nonce-gw-001' -C 1 &
```

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT -t 'provision/gateway/new' -m '{
  "serial":"GW-HP-001",
  "hw":"gw-rev1",
  "nonce":"nonce-gw-001"
}'
```

### Verify
- Subscriber prints: `{"pairingToken":"..."}` (~64 hex chars)
- DB:
```sql
SELECT id, serial, status, "pairingTokenUsed", "pairingTokenExpiresAt" > NOW() AS active
FROM gateway WHERE serial='GW-HP-001';
-- Expect: status=PENDING, pairingTokenUsed=false, active=true
```

```bash
export GATEWAY_PAIRING_TOKEN=<copy-from-mqtt-resp>
```

### Expected result
- Log: `Gateway provisioned: serial=GW-HP-001 id=...`

---

## Scenario 4: Gateway Pairing via REST + Auto-Assign Devices

### Goal
App calls `POST /provision/gateway/pair` → gateway linked to farm with `mqttToken`. Server bulk-assigns **every non-disabled device in that farm** to this gateway and publishes `{ gatewayId, mqttToken }` on `provision/gateway/resp/{storedNonce}`.

### Setup
Subscribe to the same nonce-scoped response topic BEFORE calling REST (server reuses the stored nonce):
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -t 'provision/gateway/resp/nonce-gw-001' -C 1 &
```

### Execute
```bash
curl -s -X POST $API/provision/gateway/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"farmId\":\"$FARM_ID\",
    \"pairingToken\":\"$GATEWAY_PAIRING_TOKEN\"
  }" | jq
```

### Verify
- HTTP 200 `{ gatewayId, mqttToken }`
- MQTT subscriber sees `{"gatewayId":"...","mqttToken":"..."}`
- DB:
```sql
-- Gateway paired
SELECT status, "farmId", "pairingTokenUsed", "pairedAt", "mqttToken" IS NOT NULL AS has_token
FROM gateway WHERE serial='GW-HP-001';
-- Expect: status=PAIRED, farmId=$FARM_ID, pairingTokenUsed=true, has_token=t

-- Device from Scenario 2 auto-assigned
SELECT id, "gatewayId" FROM device WHERE "farmId"='$FARM_ID' AND status <> 'DISABLED';
-- Expect: every row has gatewayId=<this gateway's id>
```

```bash
export GATEWAY_ID=$(psqlc -tAc "SELECT id FROM gateway WHERE serial='GW-HP-001'")
```

### Expected result
- Log: `Gateway <id>: auto-assigned N farm devices`
- Future commands for any farm device now route via gateway-scoped topic (Scenario 9)

---

## Scenario 5: Gateway Heartbeat → lastSeenAt / firmwareVersion

### Goal
Gateway publishes heartbeat on `gateway/{gatewayId}/status`; server updates `lastSeenAt` and optional `firmwareVersion`.

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "gateway/$GATEWAY_ID/status" \
  -m '{"type":"heartbeat","fw":"gw-1.2.0"}'
```

### Verify
```sql
SELECT "lastSeenAt" > NOW() - INTERVAL '10 seconds' AS fresh,
       "firmwareVersion"
FROM gateway WHERE id='$GATEWAY_ID';
-- Expect: fresh=t, firmwareVersion='gw-1.2.0'
```

```bash
curl -s $API/gateways/$GATEWAY_ID/status -H "Authorization: Bearer $TOKEN" | jq
# Expect: online=true, firmwareVersion="gw-1.2.0"
```

### Expected result
- Silent update; no broadcast emitted for heartbeats
- REST endpoint reflects `online: true` (within 90s window)

---

## Scenario 6: Device Heartbeat → lastSeenAt (throttled telemetry)

### Goal
Device publishes heartbeat on `device/{deviceId}/status`; server updates `lastSeenAt`.

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/status" \
  -m '{"type":"heartbeat"}'
```

### Verify
```sql
SELECT "lastSeenAt" > NOW() - INTERVAL '10 seconds' AS fresh
FROM device WHERE id='$DEVICE_ID';
-- Expect: fresh=t
```

### Expected result
- Heartbeat silently updates `lastSeenAt`, no WebSocket broadcast (by design for heartbeat)

---

## Scenario 7: Device Telemetry → DB + WebSocket + events

### Goal
Device publishes sensor data on `device/{deviceId}/telemetry`. Server:
1. Updates `lastSeenAt` (throttled: only if last update > 30s ago)
2. Broadcasts to `/device` WebSocket namespace room `device:{deviceId}`
3. Emits `telemetry.received` → SensorService stores row in `sensor_data`
4. Optionally emits `pump.started/stopped` when `pumpStatus` present

### Setup
(Optional) Connect a Socket.IO client to `/device` namespace with `auth.token = $TOKEN` to observe broadcasts. If no client is available, rely on DB + server logs.

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/telemetry" \
  -m '{
    "temperature":27.5,
    "humidity":68,
    "soilMoisture":42,
    "pumpStatus":1,
    "mode":"auto",
    "controlMode":"threshold"
  }'
```

### Verify
```sql
-- Telemetry stored
SELECT COUNT(*) FROM sensor_data WHERE "deviceId"='$DEVICE_ID';
-- Expect: >= 1 (one row per sensor type configured for this device)

-- lastSeenAt refreshed
SELECT "lastSeenAt" > NOW() - INTERVAL '10 seconds' AS fresh
FROM device WHERE id='$DEVICE_ID';
-- Expect: fresh=t
```

- Server log shows: `Processing telemetry from <deviceId>`
- Event emitted: `pump.started` (due to `pumpStatus=1`)
- If a WebSocket client is joined to `device:$DEVICE_ID`, it receives a `deviceData` event with `type:"telemetry"` + payload + `receivedAt`

### Expected result
- Telemetry persisted, broadcast, and events fired for downstream sensor/threshold pipeline

---

## Scenario 8: Device Command via Direct WiFi (no gateway)

> ⚠️ This scenario must be run *before* Scenario 4 (gateway pairing), or on a **different** device that has `gatewayId=null`. After Scenario 4, the first test device now has `gatewayId` set.

### Goal
With `device.gatewayId = NULL`, `SyncService.sendCommandToDevice()` publishes to `device/{deviceId}/cmd`.

### Setup
Provision + pair a second device **without** a gateway, OR reset the first device's gatewayId temporarily:
```sql
UPDATE device SET "gatewayId"=NULL WHERE id='$DEVICE_ID';
```
Subscribe to the direct topic:
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -v -t "device/$DEVICE_ID/cmd" &
```

### Execute
Invoke the command endpoint (example — actual path is in `src/device/device.controller.ts`):
```bash
curl -s -X POST $API/device/$DEVICE_ID/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"command":"PUMP_ON","params":{"duration":60}}'
```

### Verify
- MQTT subscriber prints on `device/$DEVICE_ID/cmd`:
  `{"command":"PUMP_ON","data":{"duration":60},"timestamp":"..."}`
- **No** `mac` field (WiFi direct)
- `command.dispatched` event emitted → CommandLog row inserted:
```sql
SELECT command, source, success
FROM command_log
WHERE "deviceId"='$DEVICE_ID' ORDER BY "createdAt" DESC LIMIT 1;
-- Expect: command=PUMP_ON, source=MANUAL, success=true
```

### Expected result
- Command delivered on direct device topic, logged as MANUAL

---

## Scenario 9: Device Command via Gateway (LoRa fallback)

### Goal
With `device.gatewayId` set, `SyncService.sendCommandToDevice()` publishes to
`gateway/{gatewayId}/device/{deviceId}/cmd` and includes `mac` so the gateway can route over LoRa.

### Setup
Restore gateway assignment from Scenario 4 (or run after Scenario 4):
```sql
UPDATE device SET "gatewayId"='$GATEWAY_ID' WHERE id='$DEVICE_ID';
```
Subscribe to gateway-scoped topic:
```bash
mosquitto_sub -h $MQTT_HOST -p $MQTT_PORT -v \
  -t "gateway/$GATEWAY_ID/device/$DEVICE_ID/cmd" &
```

### Execute
```bash
curl -s -X POST $API/device/$DEVICE_ID/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"command":"PUMP_OFF","params":{}}'
```

### Verify
- MQTT subscriber prints:
  `{"command":"PUMP_OFF","data":{},"timestamp":"...","mac":"AA:BB:CC:DD:EE:01"}`
- The `mac` field equals `device.mac` (so gateway can identify target LoRa node)
- CommandLog row appended for `PUMP_OFF`

### Expected result
- Server routes via gateway topic whenever device has a `gatewayId`
- WebSocket broadcast `type:"commandSent"` fired to farm clients

---

## Scenario 10: Device Command Response → state update

### Goal
Device acknowledges a command on `device/{deviceId}/resp`. Server:
1. Broadcasts `type:"commandResponse"` via WebSocket
2. On `PUMP_ON/OFF` + `success=true` → updates `device.pumpEnabled` + broadcasts `pumpStateChanged`
3. On `FERTILIZER_ON/OFF` + `success=true` → updates `device.fertilizerEnabled`
4. On `SET_IRRIGATION_MODE` → updates `irrigationMode` + emits `device.mode.changed`
5. On `SET_MODE` → updates `controlMode`
6. On `OTA_UPDATE` → emits `firmware.update.reported`

### Execute (PUMP_ON ack)
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/resp" \
  -m '{"command":"PUMP_ON","success":true}'
```

### Verify
```sql
SELECT "pumpEnabled" FROM device WHERE id='$DEVICE_ID';
-- Expect: pumpEnabled=true
```
- Server log: `Device <id> pumpEnabled updated to true`

### Execute (SET_IRRIGATION_MODE ack)
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/resp" \
  -m '{"command":"SET_IRRIGATION_MODE","success":true,"irrigationMode":"auto"}'
```
```sql
SELECT "irrigationMode" FROM device WHERE id='$DEVICE_ID';
-- Expect: 'auto'
```

### Execute (OTA_UPDATE report)
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/resp" \
  -m '{"command":"OTA_UPDATE","success":true,"version":"1.1.0","previousVersion":"1.0.0","duration":42}'
```
- Server log: `OTA report via MQTT: device=<id> version=1.1.0 success=true`
- `firmware.update.reported` event fires → check firmware update history if feature exists

### Expected result
- All state columns reflect device-confirmed values
- Mobile clients receive state-change broadcasts

---

## Scenario 11: Device LWT (disconnect broadcast)

### Goal
EMQX publishes LWT on `device/{deviceId}/status` with `reason:"lwt"` → server clears `lastSeenAt`, broadcasts to WebSocket, emits `pump.disconnected` + `fertilizer.disconnected`.

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "device/$DEVICE_ID/status" \
  -m '{"reason":"lwt","online":false}'
```

### Verify
```sql
SELECT "lastSeenAt" FROM device WHERE id='$DEVICE_ID';
-- Expect: NULL
```
- Mobile clients in `device:$DEVICE_ID` room receive `deviceStatus` with `reason:"lwt"`
- `pump.disconnected` and `fertilizer.disconnected` events fired

---

## Scenario 12: Gateway LWT

### Goal
Gateway disconnect — server clears gateway `lastSeenAt`.

### Execute
```bash
mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT \
  -t "gateway/$GATEWAY_ID/status" \
  -m '{"reason":"lwt"}'
```

### Verify
```sql
SELECT "lastSeenAt" FROM gateway WHERE id='$GATEWAY_ID';
-- Expect: NULL
```
```bash
curl -s $API/gateways/$GATEWAY_ID/status -H "Authorization: Bearer $TOKEN" | jq
# Expect: online=false, lastSeenAt=null
```

---

## Checklist

- [ ] **Scenario 1** — Device provisioning: `provision/new` → `provision/resp/{nonce}` + Device(PENDING) + PairingToken
- [ ] **Scenario 2** — Device REST pairing: `POST /provision/pair` → `PAIRED` + `set_owner` MQTT cmd + token used
- [ ] **Scenario 3** — Gateway provisioning: `provision/gateway/new` → Gateway(PENDING) + `provision/gateway/resp/{nonce}`
- [ ] **Scenario 4** — Gateway REST pairing: `POST /provision/gateway/pair` → `PAIRED` + bulk auto-assign farm devices + second resp message
- [ ] **Scenario 5** — Gateway heartbeat: `gateway/+/status` heartbeat → `lastSeenAt` + `firmwareVersion` updated
- [ ] **Scenario 6** — Device heartbeat: `device/+/status` heartbeat → `lastSeenAt` updated silently
- [ ] **Scenario 7** — Device telemetry: stored in `sensor_data`, WS broadcast, `telemetry.received` + pump events fired
- [ ] **Scenario 8** — Command direct WiFi: publishes to `device/{id}/cmd` (no gateway), CommandLog MANUAL
- [ ] **Scenario 9** — Command via gateway: publishes to `gateway/{gw}/device/{id}/cmd` with `mac`
- [ ] **Scenario 10** — Device response: state fields (`pumpEnabled`, `fertilizerEnabled`, `irrigationMode`, `controlMode`, firmware) updated
- [ ] **Scenario 11** — Device LWT: `lastSeenAt=NULL` + disconnect events fired
- [ ] **Scenario 12** — Gateway LWT: gateway `lastSeenAt=NULL`, REST status shows offline

---

## Unresolved questions

- Scenario 8 assumes a `POST /device/:id/command` endpoint — confirm the exact route/DTO in [src/device/device.controller.ts](src/device/device.controller.ts) before running. If commands are sent only via WebSocket `sendCommand` message, adapt the Execute step accordingly.
- Gateway-scoped topic `gateway/{gatewayId}/device/{deviceId}/cmd` is produced by server but the firmware-side receiver is out of scope; this guide only verifies the publish side.
- Scenario 7 side-effects (sensor_data rows, threshold alerts) depend on `SensorConfig` being pre-seeded for `$DEVICE_ID`. If no configs exist, telemetry is broadcast but nothing is persisted in `sensor_data`.
