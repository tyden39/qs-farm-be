# Test Guide: Firmware Delete & Update Log Preservation

**Feature:** Delete firmware without cascade-deleting OTA update logs; logs preserve `firmwareVersion` snapshot  
**Endpoints:** `DELETE /api/firmware/:id`, `GET /api/firmware/logs`, `POST /api/firmware/:id/deploy`  
**Date:** 2026-04-06

---

## Prerequisites

```bash
# 1. Start stack
docker-compose up -d

# 2. Get auth token (replace with real credentials)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}' \
  | jq -r '.accessToken')

# 3. Export reusable vars
export API=http://localhost:3000/api
export AUTH="Authorization: Bearer $TOKEN"
```

---

## Scenario 1: Delete firmware with no associated logs

### Goal
Firmware with zero update logs can be deleted cleanly; physical file is removed.

### Setup
```bash
# Upload a test firmware (.bin file)
FIRMWARE_ID=$(curl -s -X POST $API/firmware/upload \
  -H "$AUTH" \
  -F "file=@/tmp/test.bin" \
  -F "version=9.9.0" \
  -F "hardwareModel=ESP32" \
  | jq -r '.id')
echo "Created firmware: $FIRMWARE_ID"

# Note the file path for later verification
FILE_PATH=$(curl -s $API/firmware/$FIRMWARE_ID -H "$AUTH" | jq -r '.filePath')
echo "File path: $FILE_PATH"
```

### Execute
```bash
curl -s -X DELETE $API/firmware/$FIRMWARE_ID -H "$AUTH"
```

### Verify
```bash
# 1. Firmware record gone
curl -s $API/firmware/$FIRMWARE_ID -H "$AUTH"
# Expected: 404 Not Found

# 2. Physical file deleted
docker-compose exec app ls $FILE_PATH 2>&1
# Expected: "No such file or directory"

# 3. DB: no orphan row
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "SELECT COUNT(*) FROM firmware WHERE id = '$FIRMWARE_ID';"
# Expected: count = 0
```

### Expected result
- HTTP 200/204 on delete
- 404 on subsequent GET
- Physical `.bin` file removed from container filesystem

---

## Scenario 2: Delete firmware that has update logs — logs must survive

### Goal
Deleting a firmware that was deployed to devices does NOT delete the update logs.  
Logs retain `firmware_version` snapshot for historical readability.

### Setup
```bash
# Upload firmware
FIRMWARE_ID=$(curl -s -X POST $API/firmware/upload \
  -H "$AUTH" \
  -F "file=@/tmp/test.bin" \
  -F "version=1.2.3" \
  -F "hardwareModel=ESP32" \
  | jq -r '.id')

# Deploy to a farm (creates FirmwareUpdateLog records)
FARM_ID=<your-farm-uuid>
curl -s -X POST $API/firmware/$FIRMWARE_ID/deploy \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"farmId\": \"$FARM_ID\"}"

# Verify logs were created
curl -s "$API/firmware/logs?firmwareId=$FIRMWARE_ID" -H "$AUTH" | jq '.data | length'
# Expected: > 0 (one per device in farm)

# Save a log ID for later check
LOG_ID=$(curl -s "$API/firmware/logs?firmwareId=$FIRMWARE_ID" -H "$AUTH" \
  | jq -r '.data[0].id')
```

### Execute
```bash
curl -s -X DELETE $API/firmware/$FIRMWARE_ID -H "$AUTH"
```

### Verify
```bash
# 1. Delete succeeded
curl -s $API/firmware/$FIRMWARE_ID -H "$AUTH"
# Expected: 404

# 2. Logs still exist
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "SELECT id, firmware_id, firmware_version, status FROM firmware_update_log WHERE firmware_id = '$FIRMWARE_ID';"
# Expected: rows returned, firmware_version = '1.2.3', firmware_id = original UUID (no FK, value intact)

# 3. Logs readable via API (firmwareId filter still works since it's a plain column)
curl -s "$API/firmware/logs?firmwareId=$FIRMWARE_ID" -H "$AUTH" | jq '.data | length'
# Expected: same count as before delete

# 4. Spot-check firmwareVersion on a log
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "SELECT firmware_version FROM firmware_update_log WHERE id = '$LOG_ID';"
# Expected: '1.2.3'
```

### Expected result
- Firmware deleted; logs untouched
- `firmware_version` = `'1.2.3'` preserved in every log row
- `firmware_id` retains original UUID (no FK cascade, no SET NULL)

---

## Scenario 3: Deploy populates `firmwareVersion` in new logs

### Goal
Newly created logs via `POST /firmware/:id/deploy` store `firmware_version` snapshot.

### Setup
```bash
FIRMWARE_ID=<existing-firmware-uuid>
FARM_ID=<farm-uuid>
```

### Execute
```bash
curl -s -X POST $API/firmware/$FIRMWARE_ID/deploy \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"farmId\": \"$FARM_ID\"}"
```

### Verify
```bash
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "SELECT firmware_version, firmware_id, status, created_at
   FROM firmware_update_log
   WHERE firmware_id = '$FIRMWARE_ID'
   ORDER BY created_at DESC LIMIT 5;"
# Expected: firmware_version is NOT NULL, matches firmware.version
```

### Expected result
- `firmware_version` column populated (non-null) on all new log rows

---

## Scenario 4: Self-initiated OTA report also stores `firmwareVersion`

### Goal
Device-reported OTA (via `POST /firmware/report`) creates a log with `firmware_version`.

### Execute
```bash
curl -s -X POST $API/firmware/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<device-uuid>",
    "version": "1.2.3",
    "status": "success",
    "previousVersion": "1.1.0",
    "duration": 5000
  }'
```

### Verify
```bash
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "SELECT firmware_version, status FROM firmware_update_log
   WHERE device_id = '<device-uuid>'
   ORDER BY created_at DESC LIMIT 1;"
# Expected: firmware_version = '1.2.3', status = 'success'
```

---

## Edge Cases

### 404 — Delete non-existent firmware
```bash
curl -s -X DELETE $API/firmware/00000000-0000-0000-0000-000000000000 -H "$AUTH"
# Expected: 404 Not Found
```

### 401 — No auth token
```bash
curl -s -X DELETE $API/firmware/<any-id>
# Expected: 401 Unauthorized
```

### Schema check — `firmware_version` column exists
```bash
docker-compose exec postgres psql -U $DB_USER -d $DB_NAME -c \
  "\d firmware_update_log"
# Expected: firmware_version column present (varchar(20), nullable)
# Expected: firmware_id has NO foreign key constraint referencing firmware table
```

---

## Checklist

- [ ] Scenario 1: Delete firmware with no logs → 200 + file removed
- [ ] Scenario 2: Delete firmware with logs → logs survive, `firmware_version` intact
- [ ] Scenario 3: Deploy → new logs have `firmware_version` populated
- [ ] Scenario 4: OTA self-report → `firmware_version` stored
- [ ] Edge: 404 on unknown ID
- [ ] Edge: 401 without token
- [ ] Schema: `firmware_version` column exists, no FK constraint on `firmware_id`
