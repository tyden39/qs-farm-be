# Codebase Summary

## Project Overview

**IoT Farm Management Platform** - Production-grade NestJS 8 monolith with 14 feature modules, 160+ TypeScript files (~15,000 LOC). Comprehensive real-time IoT system combining REST APIs, MQTT device communication, WebSocket client updates, FCM push notifications, and advanced features (zone management, pump/fertilizer session tracking, coffee price intelligence).

**Tech Stack:** NestJS 8, PostgreSQL 14, TypeORM 0.2, Socket.IO 4.4, MQTT 5.14.1, EMQX 5.4, Firebase Admin SDK, JWT auth

---

## Architecture Overview

```
IoT Devices (MQTT) ↔ EMQX Broker ↔ NestJS Backend ↔ PostgreSQL
                                    ├── REST APIs (/api/*)
                                    ├── Socket.IO Gateway (/device)
                                    ├── Event Emitter (decoupling)
                                    └── FCM Notifications
                        ↑
                    Web/Mobile Clients (WebSocket)
```

**Key Pattern:** Event-driven architecture using @nestjs/event-emitter. MQTT messages trigger domain events (telemetry.received, command.dispatched) that decouple services. SyncService acts as MQTT↔WebSocket bridge with 60s farmId caching. Socket.IO uses room-based subscriptions (device:{id}, farm:{id}).

---

## Core Modules (14 Feature Modules)

### Authentication & User Management
- **AuthModule** (auth.*) - JWT dual-token strategy (accessToken 60m, refreshToken 30d), local+JWT strategies, password reset with OTP
- **UserModule** (user.*) - CRUD, avatar uploads, profile management, token version revocation
- **ResetToken entity** - OTP/reset tokens with 24h expiry

### Farm & Zone Management
- **FarmModule** (farm.*) - Farm CRUD, user association, farm-level configuration inheritance
- **ZoneModule** (zone.*) - Zone grouping for devices, zone-level sensor configs/thresholds, togglePump (broadcast to all devices in zone)
- **ConfigResolutionService** - Runtime config resolution: device(mode) → device(null) → zone(mode) → zone(null) fallback chain, 60s cache invalidation on updates

### Device Management & Real-time Sync
- **DeviceModule** (device/*)
  - **DeviceService** - CRUD, status tracking (PENDING→PAIRED→ACTIVE→DISABLED), device token regeneration
  - **MqttService** - MQTT client (auto-reconnect), connects to EMQX broker on port 1883
  - **SyncService** - Bridges MQTT ↔ WebSocket, listens to device/+/telemetry|status|resp, farm context caching (60s TTL)
  - **DeviceGateway** - Socket.IO /device namespace, JWT auth on handshake, subscribeToDevice/Farm events, sendCommand queuing
  - **PairingToken entity** - One-time provisioning tokens (24h expiry)

### Sensor Data & Thresholds
- **SensorModule** (sensor/*)
  - **SensorService** @OnEvent('telemetry.received') - Parses device payload into individual readings, bulk-inserts SensorData
  - **ThresholdService** - Evaluates MIN/MAX thresholds (WARNING/CRITICAL), anti-spam 30s cooldown
  - **Entities:**
    - SensorConfig (device-level sensor setup)
    - SensorThreshold (threshold rules with min/max/level)
    - SensorData (bigint PK, high-volume time-series, indexed on deviceId+createdAt)
    - AlertLog (threshold breach history)
    - CommandLog (manual+automated commands)
  - **SensorType enum** - WATER_PRESSURE, WATER_FLOW, PUMP_TEMPERATURE, SOIL_MOISTURE, ELECTRICAL_CURRENT, ELECTRICAL_PHASE, PUMP_STATUS, FERT_TEMPERATURE, FERT_CURRENT, FERT_PHASE, FERT_STATUS (11 types total)
  - **Analytics** - Time-bucket aggregation (HOUR/DAY/WEEK/MONTH), farm comparison queries

### Device Provisioning & Pairing
- **ProvisionModule** (provision.*)
  - **ProvisionService** - Device provisioning flow (serial+nonce validation), generates pairing tokens, MQTT response publishing
  - **EmqxModule** - MQTT auth webhook (/api/emqx/auth), ACL enforcement (/api/emqx/acl) for device isolation and farm scoping
  - Device state triggers ACL updates (EMQX integration)

### Scheduling & Automation
- **ScheduleModule** (schedule.*)
  - **ScheduleService** @Interval(60s) - Processes 1,000+ schedules per run
  - **ScheduleType:** Recurring (weekday+time, timezone-aware) + One-time (auto-disable after execution)
  - **Retry logic** - Automatic retry for missed executions
  - **Translation** - Vietnamese labels (PUMP_ON→"Bật máy bơm", PUMP_OFF→"Tắt máy bơm", SET_IRRIGATION_MODE→"Đặt chế độ tưới")
  - **Farm owner cache** - 5min TTL to reduce DB queries during FCM notifications
  - **Mode-change detection** - SET_IRRIGATION_MODE triggers threshold profile re-sync

### Notifications
- **NotificationModule** (notification/*)
  - **FcmService** - Firebase Admin SDK integration, multi-token batch sending, automatic invalid token cleanup
  - **DeviceToken entity** - Track FCM tokens per user
  - Event-driven triggers (telemetry, alerts, schedule execution)

### Fertilizer & Pump Session Tracking
- **FertilizerModule** (fertilizer/*)
  - **FertilizerService** @OnEvent('fertilizer.started|stopped|disconnected') - Session lifecycle management
  - **FertilizerSession entity** - ACTIVE/STOPPED/INTERRUPTED tracking with 13+ aggregate columns (temp, current, duration, energy consumed)
  - **Control modes** - AUTO (threshold-based), MANUAL (user-triggered), SCHEDULE (time-based)
  - **Excel export** - XLSX reports with session data, sensor aggregation
  - **Interrupted reason tracking** - Sensor failures, power loss, user stop

- **PumpModule** (pump/*)
  - **PumpSession entity** - Similar to fertilizer, tracks pump operating hours and session metrics
  - **Excel export** - Maintenance reports, usage patterns, energy consumption

### Firmware Management
- **FirmwareModule** (firmware/*)
  - **FirmwareService** @OnEvent('firmware.update.requested') - OTA update orchestration
  - **FirmwareUpdateLog entity** - Track update history per device
  - **DeviceGateway integration** - requestFirmwareUpdate WebSocket event

### Other Modules
- **CoffeePriceModule** - Daily coffee price scraping (noon UTC), trending analysis
- **FilesModule** - Disk-based file storage (Multer), user avatars, firmware binaries, Excel exports
- **ConfigModule** - Environment variable management (.env parsing)

---

## REST API Endpoints (101 endpoints total)

### Authentication
- `POST /auth/signup` - User registration
- `POST /auth/signin` - JWT generation
- `POST /auth/refresh` - Token refresh
- `POST /auth/password-reset` - OTP request
- `POST /auth/verify-otp` - Reset token generation

### User & Profile
- `GET/PATCH /user/profile` - User CRUD
- `POST /user/avatar` - Avatar upload (Multer)
- `POST /user/device-token` - FCM token registration

### Farm & Zone
- `GET/POST /farm` - Farm management (CRUD)
- `GET/POST /zone` - Zone management (CRUD)
- `GET/POST/PATCH/DELETE /zone/:id/sensor-config` - Zone sensor templates
- `GET/POST/PATCH/DELETE /zone/:id/threshold` - Zone thresholds
- `POST /zone/:id/pump` - Toggle pump across all zone devices

### Device Management
- `GET/POST /device` - Device CRUD, status tracking
- `POST /device/:id/token` - Token regeneration
- `POST /device/:id/command` - Manual command dispatch
- `POST /device/:id/unpair` - Device unpair

### Provisioning & EMQX
- `POST /provision/pair` - Device pairing with token
- `POST /emqx/auth` - MQTT authentication webhook
- `POST /emqx/acl` - MQTT ACL enforcement webhook

### Sensor Data & Analytics
- `GET /sensor/:id/data` - Time-series data with pagination
- `GET /sensor/analytics/stats` - Aggregated statistics
- `GET /sensor/analytics/farm-comparison` - Multi-farm comparison
- `GET /sensor/alerts` - Alert history with filtering
- `GET /sensor/commands` - Command log (manual+automated)
- `GET /sensor/config` - Sensor configuration endpoints (20+ methods)

### Scheduling
- `GET/POST /schedule` - Schedule CRUD, execute-now endpoint
- `PATCH /schedule/:id/disable` - Disable schedule

### Notifications
- `POST /notification/token` - Register FCM token
- `DELETE /notification/token/:token` - Revoke FCM token

### Firmware & Reporting
- `GET/POST /firmware` - Firmware CRUD, upload
- `GET /pump/report` - Pump session reports (Excel export)
- `GET /fertilizer/report` - Fertilizer session reports (Excel export)

### External Data
- `GET /coffee-price/current` - Latest coffee price
- `GET /coffee-price/trend` - Price trending

---

## Database Schema (21 entities)

**Core:**
- User (UUID PK, auth + profile fields)
- Farm (UUID PK, userId FK, farm config)
- Device (UUID PK, farmId FK, zoneId FK, status enum, irrigation/control modes)

**Zones:**
- Zone (UUID PK, farmId FK, pumpEnabled flag)
- ZoneSensorConfig (zone sensor templates)
- ZoneThreshold (zone threshold rules)

**Sensors & Alerts:**
- SensorConfig (device-level sensor setup)
- SensorThreshold (threshold rules with min/max/level)
- SensorData (bigint auto-increment PK, high-volume time-series)
- AlertLog (threshold breaches)
- CommandLog (manual+automated commands)

**Sessions & Tracking:**
- PumpSession (13+ aggregate columns: temperature, current, duration, energy)
- FertilizerSession (similar to pump, includes control mode)

**Scheduling & Auth:**
- DeviceSchedule (recurring + one-time, timezone-aware)
- ResetToken (OTP/reset tokens, 24h expiry)
- PairingToken (one-time provisioning, 24h expiry)
- DeviceToken (FCM device tokens)

**Configuration & Files:**
- CoffeePrice (daily prices from scraping)
- Firmware (OTA firmware metadata)
- FirmwareUpdateLog (device update history)
- File (user avatar + binary metadata)

---

## Key Features & Workflows

### Device Provisioning Flow
1. Device publishes provision/new with serial+hw+nonce
2. SyncService.handleProvisioningMessage parses MQTT message
3. ProvisionService validates serial, creates Device (status=PENDING)
4. Response sent to provision/{nonce}/resp with pairing token
5. Device uses token in pair-device endpoint to move to PAIRED status

### Real-time Telemetry Pipeline
1. Device publishes device/{deviceId}/telemetry (MQTT)
2. SyncService.handleDeviceTelemetry → eventEmitter.emit('telemetry.received')
3. SensorService @OnEvent processes readings, stores SensorData
4. ThresholdService evaluates thresholds, emits alerts
5. DeviceGateway broadcasts to WebSocket rooms (device:{id}, farm:{id})
6. FcmService sends notifications to farm owner (FCM)

### Scheduling & Notifications
1. ScheduleService @Interval(60s) evaluates 1,000+ schedules
2. MODE_CHANGE_COMMANDS trigger ConfigResolutionService cache invalidation
3. Commands sent via SyncService.sendCommandToDevice → MqttService.publish
4. Device responds on device/{deviceId}/resp
5. FarmOwnerCache (5min TTL) optimizes FCM user lookups

### Zone Management & Multi-Device Commands
1. ZoneService.togglePump broadcasts PUMP_ON/OFF to all zone devices
2. ConfigResolutionService resolves active irrigation mode (device → zone fallback)
3. All commands logged in CommandLog with source (manual/schedule/zone)

---

## Authentication & Security

- **JWT Strategy:** Dual-token (accessToken 60m, refreshToken 30d), stored in HTTP-only cookies
- **Token Revocation:** User.tokenVersion field enables immediate revocation on logout
- **MQTT Auth:** EMQX webhook validates device credentials, enforces per-device ACL
- **Farm Scoping:** All queries filtered by user.farmId, zone-level config inheritance prevents cross-farm data leaks
- **Validation:** class-validator + whitelist/transform in ValidationPipe
- **Password Security:** bcryptjs with salt rounds=7

---

## Configuration

**Environment Variables (.env):**
```
DB_HOST, DB_PORT, DB_USERNAME, DB_PASS, DB_NAME
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRE, JWT_REFRESH_EXPIRE
MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD
NODE_ENV, PORT (default 3000)
FIREBASE_SERVICE_ACCOUNT_PATH (optional, FCM)
```

---

## File Structure

```
src/
├── app.module.ts, main.ts
├── auth/, user/, farm/ (core identity)
├── device/, provision/, emqx/ (IoT core)
├── zone/ (farm organization)
├── sensor/, schedule/ (data processing & automation)
├── notification/, firebase-admin/ (external integration)
├── pump/, fertilizer/ (session tracking)
├── firmware/, files/, coffee-price/ (utilities)
├── shared/enums/ (IrrigationMode, ControlMode)
├── utils/ (DTOs, transformers, custom types)
└── config/ (environment management)
```

**File Counts:**
- Controllers: 13 files
- Services: 25+ files
- Entities: 21 files
- DTOs: 40+ files
- Enums: 10+ files

---

## Recent Enhancements (Phase 2 Complete)

✅ Schedule notification translation (Vietnamese labels)
✅ Zone-based config inheritance with fallback resolution
✅ Fertilizer session tracking (3 control modes, Excel export)
✅ Pump session tracking (13+ metrics, maintenance reports)
✅ FCM integration with socket.io-based user connection tracking
✅ Coffee price intelligence (daily scraping + trending)
✅ MQTT ACL enforcement for farm/device isolation

---

## File Paths (Key References)

- App entry: `/src/app.module.ts`, `/src/main.ts`
- Device gateway (WebSocket): `/src/device/websocket/device.gateway.ts`
- MQTT sync bridge: `/src/device/sync/sync.service.ts`
- Sensor processing: `/src/sensor/sensor.service.ts` (line 72: @OnEvent)
- Scheduler: `/src/schedule/schedule.service.ts` (line 28-36: Vietnamese labels)
- Zone config resolution: `/src/zone/config-resolution.service.ts`
- FCM service: `/src/notification/fcm.service.ts`
