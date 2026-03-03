# ESP OTA Test Guide - Full Luồng

## Prerequisites

- Server chạy: `yarn start:dev`
- MQTTX hoặc MQTT client để mô phỏng ESP
- Swagger UI: `http://localhost:3000/api`
- Admin account đã tạo sẵn

---

## Luồng 1: Upload Firmware (Admin)

**Endpoint:** `POST /api/firmware/upload` | Auth: JWT Bearer

```bash
# 1. Login lấy token
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"xxx"}'

# 2. Upload firmware .bin
curl -X POST http://localhost:3000/api/firmware/upload \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@firmware-v1.0.0.bin" \
  -F "version=1.0.0" \
  -F "hardwareModel=esp32" \
  -F "releaseNotes=Initial release"
```

**Mong đợi:** 201 Created → firmware metadata (id, version, checksum, filePath)

---

## Luồng 2: Publish Firmware

**Endpoint:** `POST /api/firmware/:id/publish` | Auth: JWT Bearer

```bash
curl -X POST http://localhost:3000/api/firmware/<FIRMWARE_ID>/publish \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Mong đợi:** `isPublished = true`, mobile nhận WS event `firmwarePublished`

---

## Luồng 3: ESP Check Update (Device gọi - không cần auth)

**Endpoint:** `GET /api/firmware/check`

```bash
# Có update
curl "http://localhost:3000/api/firmware/check?hardwareModel=esp32&currentVersion=0.9.0"

# Không có update (version hiện tại = mới nhất)
curl "http://localhost:3000/api/firmware/check?hardwareModel=esp32&currentVersion=1.0.0"
```

**Mong đợi:**
```json
{
  "updateAvailable": true,
  "version": "1.0.0",
  "firmwareId": "xxx",
  "checksum": "abc123...",
  "size": 632000,
  "downloadUrl": "/api/firmware/download/xxx"
}
```

---

## Luồng 4: ESP Download Firmware (không cần auth)

**Endpoint:** `GET /api/firmware/download/:id`

```bash
curl -o firmware.bin http://localhost:3000/api/firmware/download/<FIRMWARE_ID>

# Verify checksum
md5sum firmware.bin
# So sánh với checksum từ /check
```

**Mong đợi:** File .bin tải về, Content-MD5 header khớp với md5sum

---

## Luồng 5: Deploy OTA (Admin push xuống device)

**Endpoint:** `POST /api/firmware/:id/deploy` | Auth: JWT Bearer

```bash
# Deploy tới 1 device
curl -X POST http://localhost:3000/api/firmware/<FIRMWARE_ID>/deploy \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"deviceIds": ["<DEVICE_ID>"]}'

# Deploy tới cả farm
curl -X POST http://localhost:3000/api/firmware/<FIRMWARE_ID>/deploy \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"farmId": "<FARM_ID>"}'
```

**Mong đợi:**
- MQTT command `OTA_UPDATE` gửi tới `device/<deviceId>/cmd`
- FirmwareUpdateLog tạo với status `PENDING`
- Mobile nhận WS event `firmwareDeploying`

---

## Luồng 6: ESP Report Update Result (không cần auth)

**Endpoint:** `POST /api/firmware/report`

```bash
# Success
curl -X POST http://localhost:3000/api/firmware/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<DEVICE_ID>",
    "version": "1.0.0",
    "status": "success",
    "previousVersion": "0.9.0",
    "duration": 45000
  }'

# Failure
curl -X POST http://localhost:3000/api/firmware/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<DEVICE_ID>",
    "version": "1.0.0",
    "status": "failed",
    "errorMessage": "Checksum mismatch",
    "previousVersion": "0.9.0"
  }'
```

**Mong đợi:** FirmwareUpdateLog cập nhật, mobile nhận WS notification

---

## Luồng 7: Check Deploy Status (Admin)

**Endpoint:** `GET /api/firmware/:id/deploy-status` | Auth: JWT Bearer

```bash
curl http://localhost:3000/api/firmware/<FIRMWARE_ID>/deploy-status \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Mong đợi:**
```json
{
  "firmwareId": "xxx",
  "total": 5,
  "success": 3,
  "failed": 1,
  "pending": 1,
  "logs": [...]
}
```

---

## Luồng 8: Admin CRUD Firmware

```bash
# List all
curl http://localhost:3000/api/firmware \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Filter by model
curl "http://localhost:3000/api/firmware?hardwareModel=esp32" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Get detail
curl http://localhost:3000/api/firmware/<FIRMWARE_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Update info
curl -X PATCH http://localhost:3000/api/firmware/<FIRMWARE_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"releaseNotes": "Updated notes"}'

# Unpublish
curl -X POST http://localhost:3000/api/firmware/<FIRMWARE_ID>/unpublish \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Delete
curl -X DELETE http://localhost:3000/api/firmware/<FIRMWARE_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# View update logs
curl "http://localhost:3000/api/firmware/logs?deviceId=<DEVICE_ID>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## Luồng 9: Full E2E Test (MQTT + HTTP)

Mô phỏng ESP thật bằng MQTTX:

```
Bước 1: Admin upload firmware            → POST /firmware/upload
Bước 2: Admin publish firmware            → POST /firmware/:id/publish
Bước 3: Admin deploy tới device           → POST /firmware/:id/deploy
Bước 4: [MQTTX] Subscribe device/{id}/cmd → Nhận command OTA_UPDATE
Bước 5: ESP check update                  → GET /firmware/check
Bước 6: ESP download .bin                 → GET /firmware/download/:id
Bước 7: Verify MD5 checksum              → md5sum so sánh
Bước 8: ESP report kết quả               → POST /firmware/report
Bước 9: Admin check deploy status         → GET /firmware/:id/deploy-status
```

### MQTTX Setup

```
# Subscribe nhận OTA command
Topic: device/<DEVICE_ID>/cmd

# Publish response (mô phỏng ESP phản hồi)
Topic: device/<DEVICE_ID>/resp
Payload:
{
  "command": "OTA_UPDATE",
  "success": true,
  "version": "1.0.0",
  "duration": 45000,
  "previousVersion": "0.9.0"
}
```

---

## Luồng 10: Edge Cases

| # | Case | Cách test | Mong đợi |
|---|------|-----------|----------|
| 1 | Upload file không phải .bin | Upload .txt | 400 Bad Request |
| 2 | Upload file quá lớn | Upload >5MB | 413 Payload Too Large |
| 3 | Version hiện tại = mới nhất | `currentVersion=1.0.0` | `updateAvailable: false` |
| 4 | Model không tồn tại | `hardwareModel=esp99` | `updateAvailable: false` |
| 5 | Deploy tới device sai | deviceId không tồn tại | 404 Not Found |
| 6 | Report từ device sai | deviceId không tồn tại | 404 Not Found |
| 7 | Download firmware đã unpublish | Download sau unpublish | 404 hoặc 403 |
| 8 | Deploy firmware chưa publish | Deploy trước publish | 400 Bad Request |
| 9 | Upload trùng version | Upload v1.0.0 hai lần | 409 Conflict |
| 10 | Deploy không có deviceIds lẫn farmId | Body rỗng | 400 Bad Request |

---

## Tools

| Tool | Dùng cho |
|------|---------|
| **Swagger UI** | `http://localhost:3000/api` - test trực tiếp trên browser |
| **MQTTX** | Subscribe/publish MQTT topics mô phỏng ESP |
| **curl** | Test nhanh từ terminal |
| **Postman** | Test REST API có lưu collection |
| **psql** | Check database records trực tiếp |
