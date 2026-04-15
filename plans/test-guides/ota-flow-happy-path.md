# Test Guide: OTA Firmware Flow (Happy Path)

**Feature:** Upload → publish → deploy → device reports back. End-to-end OTA lifecycle for ESP devices (WiFi direct + LoRa gateway dual-channel).

---
**Endpoints / Functions:**
---

- `POST /api/firmware/upload` — multipart upload + MD5 checksum (supports `targetType=device|gateway`, `releaseNotes`)
- `GET /api/firmware` — list firmware
- `GET /api/firmware/:id` — detail
- `POST /api/firmware/:id/publish` — mark published, broadcasts `firmwarePublished` WS event
- `POST /api/firmware/:id/unpublish`
- `PATCH /api/firmware/:id` — update metadata / publish transition
- `GET /api/firmware/check` — device polls for available update (returns `releaseNotes`)
- `GET /api/firmware/download/:id` — binary download (octet-stream)
- `POST /api/firmware/:id/deploy` — push **device** OTA via MQTT (WiFi direct + LoRa gateway mirror)
- `POST /api/firmware/:id/deploy-gateways` — mobile-initiated **gateway** OTA REST; body `{ gatewayIds?: string[] } | { farmId?: string }`; ownership + publish-gate → MQTT `gateway/{gwId}/ota`
- WS `requestFirmwareUpdate` (namespace `/device`) — mobile-initiated OTA; with `gatewayIds` triggers **gateway** OTA via `deployGatewaysForUser()` → MQTT `gateway/{gwId}/ota`
- `POST /api/firmware/report` — device / gateway reports update outcome
- `GET /api/firmware/logs` — paginated update history (device + gateway logs)
- `GET /api/firmware/:id/deploy-status` — aggregated deploy stats

---
**Date:** 2026-04-15
**Mode:** `--happycase` (only end-to-end success path; negative testing skipped)
---

## Prerequisites

```bash
# Run server
yarn install && docker-compose up -d   # PostgreSQL + EMQX
yarn start:dev                          # NestJS on :3000

# Auth
export API=http://localhost:3000/api
export TOKEN=$(curl -s -X POST $API/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@test.com","password":"password123"}' | jq -r '.accessToken')

# Test fixtures (already paired ESP32 device under a farm owned by the QA user)
export DEVICE_ID=<uuid-of-paired-device>
export FARM_ID=<uuid-of-farm>
export HW_MODEL=esp32

# Fake firmware binary
dd if=/dev/urandom of=/tmp/firmware-1.5.0.bin bs=1024 count=32

# DB shortcut
alias psqldb='docker exec -it qs-farm-db psql -U postgres -d qs_farm'
```

Subscribe to MQTT to observe OTA payloads (optional, useful for verification):
```bash
mosquitto_sub -h localhost -p 1883 \
  -t "device/+/cmd" \
  -t "gateway/+/device-ota" \
  -t "gateway/+/ota" -v
```

Gateway fixture for Scenarios 9–10:
```bash
export GATEWAY_ID=<uuid-of-provisioned-gateway>
export GW_HW_MODEL=lora-gw-v1
dd if=/dev/urandom of=/tmp/gw-firmware-2.0.0.bin bs=1024 count=64
```

---

## Test Scenario 1: Upload firmware

### Goal
Verify a new firmware binary is stored, hashed, and registered.

### Setup
Confirm no row exists for the version we will upload:
```sql
SELECT COUNT(*) FROM firmware WHERE version = '1.5.0';  -- expect 0
```

### Execute
```bash
curl -s -X POST $API/firmware/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/firmware-1.5.0.bin" \
  -F "version=1.5.0" \
  -F "hardwareModel=$HW_MODEL" \
  -F "releaseNotes=QA happy path build" | tee /tmp/upload.json
export FW_ID=$(jq -r '.id' /tmp/upload.json)
```

### Verify
- HTTP **201**, response includes `id`, `version=1.5.0`, `checksum` (32-char hex MD5), `fileSize=32768`, `isPublished=false`, `targetType='device'` (default), `releaseNotes='QA happy path build'`.
- Checksum matches local file:
```bash
md5sum /tmp/firmware-1.5.0.bin   # must equal response.checksum
```
- DB row created:
```sql
SELECT id, version, "hardwareModel", "targetType", "fileSize", checksum, "releaseNotes", "isPublished", "filePath"
FROM firmware WHERE id = '<FW_ID>';
-- targetType = 'device', releaseNotes preserved verbatim
```
- File exists on server: `ls -la <filePath from row>` — size 32768.

### Expected result
- One `firmware` row with `isPublished=false`, `publishedAt=NULL`.
- Binary saved under `./files/`.

---

## Test Scenario 2: List & detail

### Goal
The new firmware appears in the list and detail endpoints.

### Execute
```bash
curl -s "$API/firmware?hardwareModel=$HW_MODEL" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$API/firmware/$FW_ID" -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- List response (HTTP 200) is an array sorted `createdAt DESC`; first item is `1.5.0`.
- Detail response returns the same row.

### Expected result
QA can find the just-uploaded firmware in the catalog.

---

## Test Scenario 3: Publish firmware

### Goal
Marking firmware as published broadcasts a WebSocket event and makes it discoverable to `/check`.

### Setup
Open a WS client subscribed to the `/device` namespace with the user's JWT, listen for `firmwarePublished`.

### Execute
```bash
curl -s -X POST $API/firmware/$FW_ID/publish \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 200, response has `isPublished=true`, `publishedAt` ISO timestamp.
- WS client receives `firmwarePublished` payload `{ id, version: '1.5.0', hardwareModel: 'esp32', releaseNotes, publishedAt }`.
- DB:
```sql
SELECT "isPublished", "publishedAt" FROM firmware WHERE id = '<FW_ID>';
-- isPublished = true, publishedAt set
```

### Expected result
Firmware is published and clients are notified in real time.

---

## Test Scenario 4: Device polls `/check` and gets the update

### Goal
Validate the firmware-discovery endpoint returns the new version with the download URL & checksum.

### Execute
```bash
# Simulate device poll (older version 1.4.0 installed)
curl -s "$API/firmware/check?deviceId=$DEVICE_ID&currentVersion=1.4.0" | jq
```

### Verify
Response (HTTP 200) shape:
```json
{
  "updateAvailable": true,
  "id": "<FW_ID>",
  "version": "1.5.0",
  "downloadUrl": "/api/firmware/download/<FW_ID>",
  "checksum": "<md5>",
  "checksumAlgorithm": "md5",
  "fileSize": 32768,
  "releaseNotes": "QA happy path build"
}
```

### Expected result
Device knows where to fetch the new binary and how to validate it.

---

## Test Scenario 5: Download binary

### Goal
The download endpoint streams the exact uploaded file.

### Execute
```bash
curl -s -o /tmp/downloaded.bin -D /tmp/headers.txt $API/firmware/download/$FW_ID
cat /tmp/headers.txt
md5sum /tmp/downloaded.bin /tmp/firmware-1.5.0.bin
```

### Verify
- Headers include `Content-Type: application/octet-stream`, `Content-Length: 32768`, `Content-MD5: <md5>`, `Content-Disposition: attachment; filename="firmware-1.5.0.bin"`.
- The two MD5 sums match.

### Expected result
Bit-exact download; checksum matches the upload-time hash.

---

## Test Scenario 6: Deploy via OTA push

### Goal
`POST /:id/deploy` creates a pending log per target device, publishes `OTA_UPDATE` MQTT command on `device/{id}/cmd`, mirrors to gateway topic when applicable, and broadcasts `firmwareDeploying` over WS.

### Setup
Ensure the device row is `status='paired'`:
```sql
SELECT id, status, "gatewayId", "firmwareVersion" FROM device WHERE id = '$DEVICE_ID';
```
Keep the `mosquitto_sub` from Prerequisites running.

### Execute
```bash
curl -s -X POST $API/firmware/$FW_ID/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deviceIds\":[\"$DEVICE_ID\"]}" | jq
```

### Verify
- HTTP 201. Response shape:
```json
{
  "firmwareId": "<FW_ID>",
  "version": "1.5.0",
  "totalTargeted": 1,
  "totalActive": 1,
  "results": [{ "deviceId": "<DEVICE_ID>", "logId": "<UUID>", "status": "sent" }]
}
```
- MQTT subscriber prints a payload on `device/<DEVICE_ID>/cmd` with `{ command: 'OTA_UPDATE', deviceId, version: '1.5.0', url: '/api/firmware/download/<FW_ID>', checksum, checksumAlgorithm: 'md5', fileSize: 32768, ts }`.
- If `device.gatewayId` is set, the same payload also appears on `gateway/<GW_ID>/device-ota`.
- DB pending log:
```sql
SELECT id, "deviceId", "firmwareId", "firmwareVersion", "previousVersion", status
FROM firmware_update_log WHERE id = '<logId>';
-- status = 'pending', firmwareVersion = '1.5.0'
```
- WS client receives device-status frame `{ type: 'firmwareDeploying', firmwareVersion: '1.5.0', timestamp }`.

### Expected result
Pending log exists, MQTT command dispatched on both channels (when gateway is present), UI is notified.

---

## Test Scenario 7: Device reports SUCCESS

### Goal
The report endpoint flips the pending log to `success`, updates the device's installed `firmwareVersion`, and broadcasts the result.

### Execute
```bash
curl -s -X POST $API/firmware/report \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"version\": \"1.5.0\",
    \"status\": \"success\",
    \"duration\": 42000,
    \"previousVersion\": \"1.4.0\"
  }" | jq
```

### Verify
- HTTP 201/200 (no error body).
- Log row updated:
```sql
SELECT status, duration, "reportedAt", "errorMessage"
FROM firmware_update_log
WHERE "deviceId" = '$DEVICE_ID' ORDER BY "createdAt" DESC LIMIT 1;
-- status = 'success', duration = 42000, reportedAt set, errorMessage NULL
```
- Device's installed version updated:
```sql
SELECT "firmwareVersion" FROM device WHERE id = '$DEVICE_ID';
-- '1.5.0'
```
- WS client receives `{ type: 'firmwareUpdateStatus', version: '1.5.0', status: 'success', duration: 42000, timestamp }`.

### Expected result
End-to-end loop closed: deploy → device flash → report → state synced.

---

## Test Scenario 8: Logs & deploy-status aggregation

### Goal
Operator endpoints reflect the completed update.

### Execute
```bash
curl -s "$API/firmware/logs?deviceId=$DEVICE_ID&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq
curl -s "$API/firmware/$FW_ID/deploy-status" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- `/logs` returns `{ data: [...], hasNextPage: false }`; latest entry has `status: 'success'`, `firmwareVersion: '1.5.0'`, `previousVersion: '1.4.0'`, populated `firmware` and `device` relations.
- `/deploy-status` returns:
```json
{ "firmwareId": "<FW_ID>", "total": 1, "success": 1, "failed": 0, "pending": 0, "logs": [...] }
```

### Expected result
Dashboard data is consistent with DB state.

---

## Test Scenario 9: Upload gateway-target firmware

### Goal
Verify `targetType=gateway` firmware is stored as a distinct artifact (so gateway OTA does not collide with device firmware catalog).

### Setup
```sql
SELECT COUNT(*) FROM firmware WHERE version = '2.0.0';  -- expect 0
```

### Execute
```bash
curl -s -X POST $API/firmware/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/gw-firmware-2.0.0.bin" \
  -F "version=2.0.0" \
  -F "hardwareModel=$GW_HW_MODEL" \
  -F "targetType=gateway" \
  -F "releaseNotes=Gateway LoRa bridge v2" | tee /tmp/gw-upload.json
export GW_FW_ID=$(jq -r '.id' /tmp/gw-upload.json)

# Publish it
curl -s -X POST $API/firmware/$GW_FW_ID/publish -H "Authorization: Bearer $TOKEN" | jq
```

### Verify
- HTTP 201, response `targetType='gateway'`, `hardwareModel='lora-gw-v1'`, `releaseNotes='Gateway LoRa bridge v2'`, `fileSize=65536`.
- DB:
```sql
SELECT id, version, "targetType", "hardwareModel", "releaseNotes", "isPublished"
FROM firmware WHERE id = '<GW_FW_ID>';
-- targetType = 'gateway', isPublished = true after publish
```

### Expected result
Gateway firmware coexists with device firmware in the catalog, flagged by `targetType`.

---

## Test Scenario 10: Deploy gateway OTA via WebSocket

### Goal
Mobile-initiated gateway OTA: emitting `requestFirmwareUpdate` with `gatewayIds` triggers `deployToGateways()`, which creates a pending log and publishes on `gateway/{gwId}/ota`. Gateway reports back via the same `POST /firmware/report` endpoint.

### Setup
Open a Socket.IO client on `/device` namespace authenticated with `$TOKEN`. Keep `mosquitto_sub` from Prerequisites active to capture `gateway/+/ota`.

Confirm the gateway row is reachable:
```sql
SELECT id, status FROM gateway WHERE id = '$GATEWAY_ID';
```

### Execute
From the connected WS client:
```js
socket.emit('requestFirmwareUpdate', {
  firmwareId: '<GW_FW_ID>',
  gatewayIds: ['<GATEWAY_ID>'],
}, (ack) => console.log(ack));

// Listen
socket.on('firmwareUpdateAck', (payload) => console.log('ack:', payload));
socket.on('firmwareUpdateError', (err) => console.error('err:', err));
```

### Verify
- Synchronous ack `{ event: 'firmwareUpdateAck', data: { message: 'Firmware update request received', firmwareId } }`.
- Async `firmwareUpdateAck` to the same socket with:
```json
{
  "firmwareId": "<GW_FW_ID>",
  "version": "2.0.0",
  "results": [{ "gatewayId": "<GATEWAY_ID>", "logId": "<UUID>", "status": "sent" }]
}
```
- MQTT subscriber prints on `gateway/<GATEWAY_ID>/ota` a JSON payload:
```json
{ "url": "<SERVER_URL>/api/firmware/download/<GW_FW_ID>", "checksum": "<md5>", "version": "2.0.0", "ts": "..." }
```
- Pending log with `gatewayId` set, `deviceId` null:
```sql
SELECT id, "gatewayId", "deviceId", "firmwareId", "firmwareVersion", status
FROM firmware_update_log
WHERE "gatewayId" = '$GATEWAY_ID' ORDER BY "createdAt" DESC LIMIT 1;
-- status = 'pending', deviceId IS NULL, firmwareVersion = '2.0.0'
```

Simulate gateway reporting success (LoRa gateways use the same HTTP report channel):
```bash
curl -s -X POST $API/firmware/report \
  -H "Content-Type: application/json" \
  -d "{
    \"gatewayId\": \"$GATEWAY_ID\",
    \"version\": \"2.0.0\",
    \"status\": \"success\",
    \"duration\": 90000
  }" | jq
```

Post-report DB state:
```sql
SELECT status, duration, "reportedAt"
FROM firmware_update_log
WHERE "gatewayId" = '$GATEWAY_ID' ORDER BY "createdAt" DESC LIMIT 1;
-- status = 'success', duration = 90000, reportedAt set
```

### Expected result
Gateway OTA loop closes: WS request → MQTT `gateway/{id}/ota` → gateway flashes → report → log flipped to success. No cross-contamination with device firmware topics.

---

## Test Scenario 11: Deploy gateway OTA via REST (mobile)

### Goal
Mobile-initiated gateway OTA over REST: `POST /firmware/:id/deploy-gateways` validates ownership (`gateway.farmId → farm.userId`) + `isPublished` flag, then delegates to `deployToGateways()` (creates pending log + publishes `gateway/{gwId}/ota`). Response is sync with `results[]`.

### Setup
- `$GW_FW_ID` from Scenario 9 is published (`isPublished=true`).
- `$GATEWAY_ID` is paired into a farm owned by QA user (same user as `$TOKEN`).
- Keep `mosquitto_sub` subscribed to `gateway/+/ota`.

```sql
SELECT g.id, g."farmId", f."userId"
FROM gateway g JOIN farm f ON f.id = g."farmId"
WHERE g.id = '$GATEWAY_ID';
-- userId must equal the QA user id
```

### Execute (gatewayIds path)
```bash
curl -s -X POST $API/firmware/$GW_FW_ID/deploy-gateways \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"gatewayIds\":[\"$GATEWAY_ID\"]}" | jq
```

### Verify
- HTTP **201**. Response shape:
```json
{
  "firmwareId": "<GW_FW_ID>",
  "version": "2.0.0",
  "results": [{ "gatewayId": "<GATEWAY_ID>", "logId": "<UUID>", "status": "sent" }]
}
```
- MQTT subscriber prints on `gateway/<GATEWAY_ID>/ota`:
```json
{ "url": "<SERVER_URL>/api/firmware/download/<GW_FW_ID>", "checksum": "<md5>", "version": "2.0.0", "ts": "..." }
```
- Pending log row:
```sql
SELECT id, "gatewayId", "deviceId", "firmwareVersion", status
FROM firmware_update_log
WHERE "gatewayId" = '$GATEWAY_ID' ORDER BY "createdAt" DESC LIMIT 1;
-- status = 'pending', deviceId IS NULL, firmwareVersion = '2.0.0'
```

### Execute (farmId path)
Alternative request body targeting all gateways in farm:
```bash
curl -s -X POST $API/firmware/$GW_FW_ID/deploy-gateways \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"farmId\":\"$FARM_ID\"}" | jq
```

### Verify
- `results[]` length equals number of gateways under `$FARM_ID`.
- One additional pending `firmware_update_log` row per gateway.

### Close the loop
Gateway reports success via the same HTTP report channel (same payload as Scenario 10):
```bash
curl -s -X POST $API/firmware/report \
  -H "Content-Type: application/json" \
  -d "{
    \"gatewayId\": \"$GATEWAY_ID\",
    \"version\": \"2.0.0\",
    \"status\": \"success\",
    \"duration\": 90000
  }" | jq
```

### Expected result
REST gateway OTA path works end-to-end, enforces ownership + publish gate, reuses `deployToGateways()` MQTT publish + logging, and converges with the WS path into the same `firmware_update_log` + `/firmware/report` loop.

---

## Checklist

- [ ] Scenario 1 — Upload stores file + computes MD5
- [ ] Scenario 2 — List & detail return the new firmware
- [ ] Scenario 3 — Publish flips flag and emits `firmwarePublished` WS event
- [ ] Scenario 4 — `/check` advertises the new version to the device
- [ ] Scenario 5 — Download streams bit-exact binary with correct headers
- [ ] Scenario 6 — Deploy creates pending log, publishes MQTT on WiFi (+ gateway), broadcasts `firmwareDeploying`
- [ ] Scenario 7 — Success report updates log + device version + emits `firmwareUpdateStatus`
- [ ] Scenario 8 — `/logs` and `/deploy-status` show success aggregation
- [ ] Scenario 9 — Gateway-target firmware upload + publish stores `targetType='gateway'` with release notes
- [ ] Scenario 10 — WS `requestFirmwareUpdate` with `gatewayIds` publishes on `gateway/{id}/ota`, success report flips log
- [ ] Scenario 11 — REST `POST /firmware/:id/deploy-gateways` (both `gatewayIds` and `farmId` paths) publishes on `gateway/{id}/ota`, enforces ownership + publish gate
