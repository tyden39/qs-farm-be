# ESP32/ESP8266 OTA Firmware Update Patterns - Research Report

**Date:** 2026-02-27
**Researcher:** Agent
**Status:** Complete

---

## Executive Summary

ESP32/ESP8266 OTA updates follow well-established patterns combining HTTP for firmware delivery and MQTT for device signaling. The typical flow: device polls HTTP server or receives MQTT signal → fetches firmware binary → validates checksum → writes to flash → reboots. Security centers on checksum verification (MD5/SHA256), version tracking, and rollback capability. Integration point with qs-farm platform: MQTT-triggered updates via existing device command infrastructure.

---

## 1. HTTP-Based OTA Update Flow

### 1.1 Standard ESP Device Behavior

**Typical client-side implementation (ESP-IDF):**

```
Device OTA Update Flow:
├─ Check for updates (periodic or MQTT-triggered)
│  └─ GET /api/firmware/check?deviceId=xxx&currentVersion=1.0.0
│     Header: Device-Model, Device-Serial, Current-Version
│     Response: { version, url, checksum, size, releaseNotes }
│
├─ If update available:
│  ├─ GET {url} (with Range header support for resume)
│  │  Response: binary firmware .bin file
│  │  Headers: Content-Length, Content-MD5
│  │
│  ├─ Stream to flash partition
│  │  └─ esp_ota_begin() → esp_ota_write() → esp_ota_end()
│  │
│  ├─ Validate checksum (MD5/SHA256)
│  │  └─ Compare received hash vs. advertised hash
│  │
│  ├─ Set as boot partition
│  │  └─ esp_ota_set_boot_partition()
│  │
│  └─ Reboot to load new firmware
│     └─ esp_restart()
│
└─ Report result
   └─ POST /api/firmware/report
      { status: "success|failed", version, error }
```

### 1.2 Advantages of HTTP-based Flow

- **Bandwidth efficient:** Only fetches once; can resume from failures
- **Device-independent:** Device controls timing, reduces server load
- **CDN-compatible:** Firmware can be served from CDN for geographic distribution
- **Checksum validation:** Device verifies before flashing

### 1.3 Key Implementation Details

**Device-side check:**
```
Triggered by:
1. Periodic timer (e.g., daily at 3 AM)
2. MQTT command: { command: "CHECK_UPDATE", params: { force: true } }
3. User-initiated via app
```

**HTTP Request headers for version checking:**
```
GET /api/firmware/check
X-Device-Model: "esp32-s3"
X-Device-Serial: "ABC-12345"
X-Current-Version: "1.2.3"
X-Device-Mac: "AA:BB:CC:DD:EE:FF"
```

**HTTP Response format:**
```json
{
  "updateAvailable": true,
  "version": "1.3.0",
  "url": "https://api.farm.local/api/firmware/download/v1.3.0",
  "checksum": "md5:abcd1234...",
  "checksumAlgorithm": "md5",
  "size": 524288,
  "releaseNotes": "Bug fixes and improvements",
  "mandatoryUpdate": false,
  "timeout": 120
}
```

---

## 2. Firmware Binary Format Specifications

### 2.1 ESP Binary (.bin) Structure

**File format:**
- **Magic byte:** `0xE9` (indicates ESP binary)
- **Segment count:** 1 byte (typically 1-4 segments)
- **Segments:** Each contains code + data
- **MD5 digest:** 16 bytes appended by esptool
- **Total size:** Typically 200KB–2MB depending on code size

**Example breakdown (ESP32):**
```
┌─────────────────────────────┐
│ Magic: 0xE9                 │  1 byte
├─────────────────────────────┤
│ Segment 1 (bootloader)      │  ~8KB
│ Segment 2 (partition table)  │  ~4KB
│ Segment 3 (app code)        │  ~300KB
│ Segment 4 (SPIFFS/LittleFS) │  ~100KB
├─────────────────────────────┤
│ MD5 Checksum                │  16 bytes
├─────────────────────────────┤
│ Padding                     │  0-3 bytes
└─────────────────────────────┘
Total: 412KB (example)
```

### 2.2 Checksum & Signature

**Checksums (device validates):**
- **MD5:** 16 hex chars; fast, standard (e.g., `abc123...`)
- **SHA256:** 64 hex chars; cryptographically secure
- Device typically supports both; MD5 more common for speed

**Validation on device:**
```c
// ESP-IDF pattern
uint8_t sha_digest[32];
esp_sha(ESP_SHA256, firmware_data, firmware_size, sha_digest);
if (memcmp(sha_digest, expected_digest, 32) == 0) {
    // Valid, proceed to flash
}
```

**Signature (optional, for security):**
- RSA-2048 or ECDSA signature appended to binary
- Device validates using public key (stored in secure boot partition)
- Prevents tampering (requires secure boot enabled)

### 2.3 Size Limits

**ESP32:**
- **Flash size:** Typically 4MB–16MB (can vary)
- **App partition:** Usually 1.5MB–2MB
- **Max OTA size:** ~1.5MB (leaves room for dual-boot fallback)
- **SPIFFS/LittleFS:** Remaining space

**ESP8266:**
- **Flash size:** 1MB–4MB (usually 4MB)
- **App partition:** ~500KB–1MB
- **Max OTA size:** ~500KB

**Best practice:** Keep firmware ≤ 1MB for universal compatibility; test on smallest supported device.

---

## 3. Server-Side OTA Architecture

### 3.1 REST API Design for OTA Server

**RESTful endpoints for firmware management:**

```
POST /api/firmware/upload
├─ Multipart form upload of .bin file
├─ Parameters: version, model (esp32/esp8266), releaseNotes, mandatory
├─ Returns: { id, version, url, checksum, createdAt }
└─ Permissions: Admin only

GET /api/firmware/check
├─ Query: deviceId, currentVersion, model
├─ Returns: { updateAvailable, version, url, checksum, size, releaseNotes }
└─ Logic: Compare device version vs. latest firmware version

GET /api/firmware/download/:version
├─ Streams firmware binary file
├─ Headers: Content-Length, Content-Disposition, Content-MD5
├─ Supports: Range requests for resume
└─ Logging: Track download IP, timestamp, firmware version

POST /api/firmware/report
├─ Device reports update success/failure
├─ Payload: { deviceId, version, status, error, duration }
├─ Stores in FirmwareReport table
└─ Used for analytics

GET /api/firmware/versions
├─ List all available firmware versions
├─ Returns: [ { version, model, releaseNotes, downloads, released } ]
└─ Permissions: Admin

DELETE /api/firmware/:version
├─ Soft-delete firmware version (mark unavailable)
└─ Prevents new downloads of deprecated versions
```

### 3.2 Database Schema for Firmware Management

```sql
-- Firmware versions
CREATE TABLE firmware (
    id UUID PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    model VARCHAR(50) NOT NULL,  -- esp32, esp8266, etc.
    fileSize INT NOT NULL,
    filePath VARCHAR(255) NOT NULL,  -- /files/firmware/v1.3.0.bin
    checksum VARCHAR(64) NOT NULL,
    checksumAlgorithm VARCHAR(10) DEFAULT 'md5',
    releaseNotes TEXT,
    mandatory BOOLEAN DEFAULT FALSE,
    available BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP,
    createdBy UUID NOT NULL REFERENCES user(id)
);

-- Firmware download logs
CREATE TABLE firmware_download_log (
    id UUID PRIMARY KEY,
    firmwareId UUID NOT NULL REFERENCES firmware(id),
    deviceId UUID NOT NULL REFERENCES device(id),
    ipAddress INET,
    startedAt TIMESTAMP,
    completedAt TIMESTAMP,
    bytesDownloaded INT,
    status ENUM ('pending', 'in_progress', 'completed', 'failed'),
    errorMessage TEXT,
    createdAt TIMESTAMP DEFAULT NOW()
);

-- Firmware update reports
CREATE TABLE firmware_update_report (
    id UUID PRIMARY KEY,
    deviceId UUID NOT NULL REFERENCES device(id),
    targetVersion VARCHAR(20),
    previousVersion VARCHAR(20),
    status ENUM ('success', 'failed', 'timeout', 'rollback'),
    errorMessage TEXT,
    duration INT,  -- milliseconds
    reportedAt TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW(),
    INDEX (deviceId, createdAt)
);
```

### 3.3 Firmware Storage Strategy

**File organization:**
```
/files/firmware/
├─ esp32/
│  ├─ v1.0.0.bin (600KB)
│  ├─ v1.1.0.bin (610KB)
│  ├─ v1.2.0.bin (625KB)
│  └─ v1.3.0.bin (632KB)  ← Latest
├─ esp8266/
│  ├─ v0.8.0.bin (256KB)
│  ├─ v0.9.0.bin (280KB)
│  └─ v1.0.0.bin (300KB)  ← Latest
└─ checksums.json  ← Cache of all checksums
```

**Checksum cache (for fast lookup):**
```json
{
  "esp32": {
    "v1.3.0": { "algorithm": "md5", "value": "abc123...", "size": 632000 },
    "v1.2.0": { "algorithm": "md5", "value": "def456...", "size": 625000 }
  },
  "esp8266": {
    "v1.0.0": { "algorithm": "md5", "value": "ghi789...", "size": 300000 }
  }
}
```

---

## 4. MQTT-Triggered OTA Updates

### 4.1 Flow: Server → Device via MQTT

**Integration with qs-farm platform:**

```
Command Dispatch (Existing Pattern):
──────────────────────────────────

1. Admin sends OTA command via REST API:
   POST /api/device/{deviceId}/command
   {
     "command": "OTA_UPDATE",
     "params": { "version": "1.3.0", "force": false }
   }

2. DeviceService.sendCommand() publishes to MQTT:
   Topic: device/{deviceId}/cmd
   Message: {
     "command": "OTA_UPDATE",
     "params": {
       "version": "1.3.0",
       "url": "https://api.farm.local/api/firmware/download/v1.3.0",
       "checksum": "abc123...",
       "checksumAlgorithm": "md5",
       "force": false
     }
   }

3. Device receives command on device/{deviceId}/cmd:
   ├─ If force=false: Check if scheduled downtime window
   ├─ If force=true: Immediately start update
   └─ HTTP GET url → validate → flash → reboot

4. Device publishes result to device/{deviceId}/resp:
   {
     "command": "OTA_UPDATE",
     "success": true,
     "version": "1.3.0",
     "duration": 45000,  // ms
     "previousVersion": "1.2.0"
   }

5. Backend processes response:
   ├─ SyncService receives on device/+/resp
   ├─ Creates FirmwareUpdateReport
   ├─ Broadcasts deviceAlert via Socket.IO
   └─ Device status updated
```

### 4.2 Broadcast OTA to Multiple Devices

**Farm-wide or group updates:**

```
POST /api/farm/{farmId}/firmware/broadcast
{
  "version": "1.3.0",
  "targetDeviceIds": ["id1", "id2", "id3"],
  "rolloutStrategy": "staggered",
  "staggerInterval": 300,  // seconds between device updates
  "force": false
}

Backend logic:
├─ Create FirmwareBroadcast record
├─ For each device:
│  ├─ If staggered: Schedule command with delay
│  └─ Dispatch OTA_UPDATE command
└─ Return tracking ID for monitoring
```

### 4.3 Batch Status Monitoring

**Track update progress across devices:**

```
GET /api/firmware/broadcast/:broadcastId/status

Response:
{
  "broadcastId": "xxx",
  "version": "1.3.0",
  "createdAt": "2026-02-27T12:00:00Z",
  "totalDevices": 15,
  "statuses": {
    "succeeded": 12,
    "failed": 1,
    "pending": 2,
    "inProgress": 0
  },
  "devices": [
    {
      "deviceId": "dev-001",
      "status": "success",
      "completedAt": "2026-02-27T12:15:30Z",
      "duration": 45000
    },
    {
      "deviceId": "dev-002",
      "status": "failed",
      "error": "Checksum mismatch",
      "attemptedAt": "2026-02-27T12:30:00Z"
    }
  ]
}
```

---

## 5. Version Management & Rollback Strategies

### 5.1 Semantic Versioning for Firmware

**Version format:** `MAJOR.MINOR.PATCH`

```
Example progression:
v1.0.0 (initial)
v1.0.1 (bug fix, rollback-friendly)
v1.1.0 (feature, rollback-friendly)
v1.2.0 (major feature)
v2.0.0 (breaking changes, careful rollback)

Metadata per version:
{
  "version": "1.3.0",
  "releaseDate": "2026-02-25",
  "releaseNotes": "...",
  "stability": "stable|beta|alpha",
  "minDeviceVersion": "1.0.0",  // Prevent downgrade
  "maxDeviceVersion": "2.0.0",  // Prevent forward-incompatible jumps
  "critical": false,             // Is update mandatory?
  "supportedModels": ["esp32-s3", "esp32-c3"],
  "buildHash": "git-sha1",      // For traceability
  "fileSize": 632000
}
```

### 5.2 Rollback Mechanism

**Dual-partition OTA architecture (esp_ota_begin):**

```
Device Flash Layout:
┌──────────────────────────────────┐
│ Bootloader (32KB)                │ (immutable)
├──────────────────────────────────┤
│ Partition Table (64KB)           │ (defines slots)
├──────────────────────────────────┤
│ OTA Slot 0 (1.5MB)               │ ← Currently running v1.2.0
├──────────────────────────────────┤
│ OTA Slot 1 (1.5MB)               │ ← New firmware downloads here
├──────────────────────────────────┤
│ NVS (Non-Volatile Storage, 16KB) │ (config, update logs)
├──────────────────────────────────┤
│ SPIFFS/LittleFS (remaining)      │ (files)
└──────────────────────────────────┘

Update Flow:
1. Download v1.3.0 → OTA Slot 1
2. Validate checksum
3. esp_ota_set_boot_partition(slot1)  ← Mark as next boot
4. Reboot
5. Bootloader loads slot1 (v1.3.0)
6. If boot fails within 10s: rollback to slot0 (v1.2.0)
7. If boot succeeds: Mark slot1 as valid, update fails
```

**Automatic rollback (watchdog):**

```c
// Device firmware
void setup() {
    // ... initialize code ...

    // Mark OTA as in-progress
    esp_ota_mark_app_valid_cancel_rollback();

    // If any critical error occurs before this call:
    // Device will rollback to previous version on reboot
}
```

### 5.3 Version Constraints & Compatibility

**Database validation:**

```sql
ALTER TABLE firmware ADD CONSTRAINT check_version_format
CHECK (version ~ '^\d+\.\d+\.\d+$');

-- Prevent downgrade
SELECT * FROM firmware
WHERE version < ? AND model = ?
ORDER BY version DESC LIMIT 1;

-- Check compatibility
SELECT * FROM firmware
WHERE model = ?
  AND available = TRUE
  AND version > current_version
  AND stability IN ('stable', 'beta')
ORDER BY version DESC;
```

---

## 6. Security Considerations

### 6.1 Firmware Integrity Verification

**Multi-layer approach:**

1. **Checksum (MD5/SHA256):**
   - Computed on server: `openssl dgst -md5 firmware.bin`
   - Device validates after download before flashing
   - Detects corruption during transit

2. **Digital Signature (optional, RSA-2048 or ECDSA):**
   - Server signs firmware with private key
   - Device validates using public key (stored in secure partition)
   - Prevents tampering by attacker

3. **HTTPS for firmware download:**
   - Encrypts binary in transit
   - Prevents man-in-the-middle attacks
   - Certificate pinning recommended for IoT devices

**Implementation example (server-side):**

```javascript
// NestJS controller
@Get('firmware/download/:version')
async downloadFirmware(@Param('version') version: string, @Res() res: Response) {
    const firmware = await this.firmwareService.getFirmware(version);

    // Set headers
    res.set('Content-MD5', firmware.checksum);
    res.set('Content-Length', firmware.fileSize);
    res.set('Content-Disposition', `attachment; filename="firmware-${version}.bin"`);

    // Stream file
    const stream = fs.createReadStream(firmware.filePath);
    stream.pipe(res);

    // Log download
    await this.firmwareService.logDownload(firmware.id, req.ip);
}

// Device-side (pseudocode)
void updateFirmware(String url, String expectedChecksum) {
    HTTPClient http;
    http.begin(url);

    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
        size_t len = http.getSize();

        // Calculate checksum while downloading
        MD5Builder md5;
        md5.begin();

        WiFiClient *stream = http.getStreamPtr();
        uint8_t buffer[512];

        esp_ota_begin(partition, len, otaHandle);

        while (http.connected() && stream->available()) {
            size_t bytesRead = stream->readBytes(buffer, 512);
            md5.add(buffer, bytesRead);
            esp_ota_write(otaHandle, buffer, bytesRead);
        }

        md5.calculate();
        String actualChecksum = md5.toString();

        // Verify checksum
        if (actualChecksum == expectedChecksum) {
            esp_ota_end(otaHandle);
            esp_ota_set_boot_partition(partition);
            esp_restart();
        } else {
            // Checksum failed, abort
            ESP_LOGE("OTA", "Checksum mismatch!");
        }
    }

    http.end();
}
```

### 6.2 API Security

**Authentication for firmware endpoints:**

```
GET /api/firmware/check
├─ No auth required (device may not have JWT)
├─ BUT: Rate-limit by IP to prevent enumeration
└─ Validate User-Agent header (device identifier)

POST /api/firmware/upload
├─ JwtAuthGuard (admin-only)
└─ Validate file size, extension, magic bytes

POST /api/firmware/report
├─ Device token OR JWT
└─ Verify deviceId matches authenticated device
```

**Rate limiting:**

```typescript
// NestJS with @nestjs/throttler
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 3600 } })  // 100 requests per hour
@Get('firmware/check')
async checkForUpdates(@Query() query: CheckUpdateDto) {
    // ...
}
```

### 6.3 Preventing Rollback Attacks

**Strategy: Track previous versions in device:**

```sql
ALTER TABLE firmware ADD COLUMN minVersionForRollback INT DEFAULT 0;
-- Set to v1, prevent rollback to v0

Device-side validation:
if (newVersion.majorVersion < device.majorVersion) {
    // Prevent downgrade across major versions
    reject("Downgrade not allowed");
}
```

---

## 7. Best Practices for ESP-IDF and Arduino OTA

### 7.1 ESP-IDF OTA Best Practices

**Code pattern:**

```c
#include "esp_ota_ops.h"
#include "esp_http_client.h"

// 1. Define OTA callback
esp_err_t ota_event_handler(esp_http_client_event_t *evt) {
    switch (evt->event_id) {
        case HTTP_EVENT_ON_DATA:
            // Process chunk
            if (!esp_ota_write(ota_handle, evt->data, evt->data_len)) {
                ESP_LOGE("OTA", "Write failed");
            }
            break;
        case HTTP_EVENT_ON_FINISH:
            ESP_LOGI("OTA", "Download complete");
            break;
        case HTTP_EVENT_DISCONNECT:
            ESP_LOGE("OTA", "Connection lost");
            break;
    }
    return ESP_OK;
}

// 2. Perform OTA
void perform_ota(const char *url) {
    esp_http_client_config_t config = {
        .url = url,
        .event_handler = ota_event_handler,
        .skip_cert_common_name_check = false,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    ESP_ERROR_CHECK(esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &ota_handle));

    ESP_ERROR_CHECK(esp_http_client_perform(client));

    // 3. Verify and finalize
    if (esp_ota_end(ota_handle) == ESP_OK) {
        ESP_ERROR_CHECK(esp_ota_set_boot_partition(update_partition));
        esp_restart();
    } else {
        ESP_LOGE("OTA", "OTA failed");
    }

    esp_http_client_cleanup(client);
}
```

### 7.2 Arduino OTA Best Practices

**Using Arduino IoT Cloud or custom HTTP:**

```cpp
#include <ArduinoOTA.h>

void setup() {
    // ArduinoOTA built-in
    ArduinoOTA.onStart([]() {
        Serial.println("Start OTA");
    });

    ArduinoOTA.onEnd([]() {
        Serial.println("\nEnd OTA");
    });

    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("Error[%u]: ", error);
        if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
        // ...
    });

    ArduinoOTA.begin();
}

void loop() {
    ArduinoOTA.handle();
}

// OR custom HTTP OTA:
void checkAndUpdateFirmware() {
    HTTPClient http;
    http.begin("https://api.farm.local/api/firmware/check?version=" + currentVersion);

    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, http.getString());

        if (doc["updateAvailable"]) {
            String url = doc["url"];
            performHTTPOTA(url, doc["checksum"]);
        }
    }
    http.end();
}
```

### 7.3 Common Pitfalls to Avoid

| Pitfall | Impact | Solution |
|---------|--------|----------|
| No checksum validation | Flash corrupted firmware | Always validate MD5/SHA256 before flashing |
| Not supporting resume | Slow on poor networks | Support HTTP Range requests |
| Blocking OTA on main thread | Device appears frozen | Use task queue or async HTTP |
| No rollback mechanism | Brick device on bad firmware | Use dual-partition OTA slots |
| Storing firmware in RAM | OOM crashes | Stream directly to flash |
| No version checking | Downgrade to broken version | Enforce version constraints |
| Hardcoded URLs | No flexibility | Store URL in MQTT message or EEPROM |

---

## 8. Integration Plan for qs-farm

### 8.1 NestJS Module Structure

**New firmware module:**

```
src/firmware/
├── firmware.module.ts
├── firmware.service.ts
├── firmware.controller.ts
├── entities/
│  ├── firmware.entity.ts
│  ├── firmware-download-log.entity.ts
│  └── firmware-update-report.entity.ts
└── dtos/
   ├── upload-firmware.dto.ts
   ├── check-update.dto.ts
   └── firmware-report.dto.ts
```

**Integration with existing modules:**

- **DeviceModule:** Extend to support OTA_UPDATE command
- **SyncService:** Handle firmware update responses
- **DeviceController:** Add firmware endpoints
- **ThresholdService:** Trigger firmware updates on device issues

### 8.2 API Endpoints Summary

```
POST   /api/firmware/upload            → Upload .bin file
GET    /api/firmware/check             → Check for updates (device)
GET    /api/firmware/download/:version → Download binary
POST   /api/firmware/report            → Report update status (device)
GET    /api/firmware/versions          → List versions (admin)
DELETE /api/firmware/:version          → Remove version (admin)
POST   /api/device/:id/firmware/update → Trigger OTA on device
GET    /api/farm/:id/firmware/status   → Check update progress
```

### 8.3 Priority for Implementation

1. **Phase 1 (MVP):** Upload + check + download endpoints
2. **Phase 2:** Device-side integration (MQTT commands)
3. **Phase 3:** Rollback + signature validation
4. **Phase 4:** Bulk updates + analytics

---

## Key Findings & Recommendations

### ✅ Confirmed Best Practices

1. **HTTP for delivery, MQTT for signaling** ✓ (aligns with qs-farm architecture)
2. **Checksum validation before flash** ✓ (non-negotiable for reliability)
3. **Dual-partition OTA** ✓ (built into ESP-IDF, enables rollback)
4. **Device version tracking** ✓ (prevents incompatibility)
5. **Rate limiting on firmware endpoints** ✓ (security baseline)

### ⚠️ Critical Implementation Details

1. **Don't block main thread during OTA** → Use task/async
2. **Support resume for large files** → HTTP Range header
3. **Validate Content-MD5 header** → Checksum before storing
4. **Stream directly to flash** → Never load entire binary into RAM
5. **Set watchdog timeout** → Auto-rollback if boot fails

### 📊 Metadata to Track

- Firmware version & release date
- Download count & success rate
- Device update duration & failures
- Rollback incidents
- Checksum mismatches (corruption detection)

### 🔒 Security Minimum

1. HTTPS for all firmware downloads
2. MD5/SHA256 checksum validation
3. Admin-only firmware upload
4. Rate-limit firmware checks by IP
5. Log all update attempts + results

---

## Unresolved Questions

1. **What's your target firmware binary size limit?** (Affects device compatibility)
2. **Will you implement digital signatures for firmware?** (Depends on security requirements)
3. **Do you need rollback analytics?** (Helps identify bad firmware versions)
4. **Should firmware updates be scheduled during off-peak hours?** (Farm-specific constraint)
5. **Will you support A/B testing (canary updates)?** (Requires phased rollout logic)

---

**End of Report**
