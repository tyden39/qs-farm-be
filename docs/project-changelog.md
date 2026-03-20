# Project Changelog

All notable changes to the IoT Farm Management Platform are documented in this file.

## Version 1.5 (2026-03-20)

### Added: Zone Hierarchy & Config Inheritance

**Feature:** Multi-level farm organization with inherited sensor configurations and zone-level controls

- **New Module:** ZoneModule with service, controller, entity, enums
- **Zone Entity:** Represents farm subdivisions with coordinates (jsonb polygon), irrigation mode, control mode
- **Config Inheritance Chain:** Device → Zone → Farm with soft override via checkAll toggle
- **Zone Sensor Configs:** Template sensor configurations at zone level for device inheritance
- **Zone Thresholds:** Per-irrigationMode threshold sets for inherited device monitoring
- **Config Resolution Service:** Runtime resolution of active config/thresholds using fallback chain (device → zone)
- **Zone Caching:** 60s TTL cache for device context (device + zone + zone configs)
- **Zone-Level Controls:**
  - Zone pump toggle: broadcast PUMP_ON/PUMP_OFF to all zone devices
  - Zone schedules: execute commands on all devices in zone
- **Device Enhancements:**
  - Added zoneId (nullable for backward compat)
  - Added latitude, longitude floats for device GPS
  - Added irrigationMode, controlMode (overridable per device)
- **Farm Enhancements:** Added coordinates (jsonb) for farm-level geography
- **Schedule Enhancement:** Support for zone-level targeting (XOR: deviceId | farmId | zoneId)
- **SensorThreshold Enhancement:** Added irrigationMode column for mode-aware thresholds
- **Sensor Pipeline Integration:** Updated telemetry processing to use resolved configs/thresholds
- **New Enums:**
  - IrrigationMode: NORMAL, SPRAY, ROOT, DRIP
  - ControlMode: AUTO, MANUAL, SCHEDULE
- **REST API:**
  - `GET/POST/PATCH/DELETE /api/zone` - zone CRUD
  - `GET/POST/PATCH/DELETE /api/zone/:id/sensor-config` - zone sensor config CRUD
  - `GET/POST/PATCH/DELETE /api/zone/:id/sensor-config/:configId/threshold` - zone threshold CRUD
  - `POST /api/zone/:id/pump` - zone pump toggle
- **Dependencies:** No new external dependencies

**Files Created:**
- `src/shared/enums/irrigation-mode.enum.ts`
- `src/shared/enums/control-mode.enum.ts`
- `src/zone/entities/zone.entity.ts`
- `src/zone/entities/zone-sensor-config.entity.ts`
- `src/zone/entities/zone-threshold.entity.ts`
- `src/zone/zone.module.ts`
- `src/zone/zone.service.ts`
- `src/zone/zone.controller.ts`
- `src/zone/zone-sensor-config.service.ts`
- `src/zone/config-resolution.service.ts`
- `src/zone/dto/` (coordinate, create/update zone, create/update zone-sensor-config, create/update zone-threshold)

**Files Modified:**
- `src/farm/entities/farm.entity.ts` - added coordinates, zones relation
- `src/device/entities/device.entity.ts` - added zoneId, lat/lng, irrigationMode, controlMode
- `src/sensor/entities/sensor-threshold.entity.ts` - added irrigationMode, updated unique constraint
- `src/schedule/entities/device-schedule.entity.ts` - added zoneId
- `src/pump/enums/` - re-exported from shared
- `src/farm/dto/` - added coordinates
- `src/device/dto/` - added zone fields
- `src/device/device.service.ts` - farmId sync on zone change
- `src/sensor/sensor.service.ts` - integrated ConfigResolutionService
- `src/sensor/threshold.service.ts` - accepts resolved thresholds
- `src/device/sync/sync.service.ts` - caches zoneId, passes in events
- `src/schedule/schedule.service.ts` - zone support in execute/findAll/validate
- `src/app.module.ts` - registered ZoneModule

**Technical Highlights:**
- Zero-downtime schema migration (TypeORM synchronize with nullable zoneId)
- Multi-level inheritance with soft override semantics
- Aggressive caching (60s TTL) for high-frequency telemetry path
- Fallback threshold resolution: device(mode) → device(null) → zone(mode) → zone(null)
- Zone-level broadcast enables farm region management
- Backward compatible (existing devices without zone continue to work)

---

## Version 1.4.1 (2026-03-17)

### Updated: Coffee Price Intelligence Scheduling

**Change:** Adjusted daily coffee price scraping schedule

- **Previous Schedule:** Midnight (00:00) Asia/Ho_Chi_Minh timezone
- **New Schedule:** Noon (12:00 PM) Asia/Ho_Chi_Minh timezone
- **Cron Expression:** `'0 12 * * *'` (updated from `'0 0 * * *'`)
- **Rationale:** Better alignment with market opening hours for more current pricing data
- **File Modified:** `src/coffee-price/coffee-price.service.ts`
- **Documentation Updated:** System architecture (CLAUDE.md)
- **Status:** Code review passed, build verified, no functional regressions

---

## Version 1.4 (2026-03-16)

### Added: Pump Session Tracking & Maintenance Monitoring

**Feature:** Real-time pump operation tracking with lifecycle events and maintenance insights

- **New Module:** PumpModule with service, controller, entity, enums
- **Session Lifecycle:** Event-driven tracking via `pump.started`, `pump.stopped`, `pump.disconnected` events
- **New Entity:** PumpSession - captures pump on/off cycles with sensor aggregates
- **Enums:**
  - `PumpSessionStatus`: active, completed, interrupted
  - `InterruptedReason`: lost_will_topic (lwt), esp_reboot, timeout
- **Device Enhancements:** Added `operatingLifeHours`, `totalOperatingHours` fields to Device entity
- **SensorType Enhancement:** Added `PUMP_STATUS` enum value
- **MQTT Session Handshake:** Server publishes sessionId to `device/{id}/session` for session identification
- **Stale Session Management:** @Interval(60s) cron closes sessions with no data >30s (prevents hanging states)
- **Report API:**
  - `GET /api/pump/report/:deviceId` - JSON report (summary, maintenance info, timeline, sessions)
  - `GET /api/pump/report/:deviceId?format=excel` - Excel export via exceljs
- **Report Contents:**
  - Summary: cycle count, operating hours, last session
  - Maintenance alerts: based on runtime thresholds
  - Timeline: chronological session events
  - Sessions list: detailed session data with interruption reasons
- **Dependencies Added:** exceljs@4.x

**Files Created:**
- `src/pump/pump.module.ts`
- `src/pump/pump.service.ts`
- `src/pump/pump.controller.ts`
- `src/pump/entities/pump-session.entity.ts`
- `src/pump/enums/pump-session-status.enum.ts`
- `src/pump/enums/interrupted-reason.enum.ts`

**Technical Highlights:**
- Event-driven session lifecycle with automatic cleanup
- JSONB storage of sensor aggregates for rich session context
- Timezone-agnostic UTC timestamps for session tracking
- Excel export with formatted tables and summaries
- Auto-closing stale sessions prevents orphaned records

---

## Version 1.3 (2026-03-12)

### Added: Coffee Price Intelligence Module

**Feature:** Daily web scraping of Vietnamese coffee prices from giacaphe.com

- **New Module:** CoffeePriceModule with service, controller, entity, enums, DTOs
- **Scraper:** Puppeteer v19 (headless browser) with Cloudflare protection handling
- **HTML Parser:** Cheerio v1.2.0 for reliable table extraction
- **Cron Scheduling:** Daily execution at midnight Asia/Ho_Chi_Minh timezone
- **Retry Logic:** 3-attempt strategy (immediate, +30s delay, +60s delay)
- **Data Model:** CoffeePrice entity with UUID PK, UNIQUE(date, market) constraint
- **Markets Covered:** 7 Vietnamese markets (Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông, Kon Tum, Hồ tiêu, USD/VND)
- **REST API:**
  - `GET /api/coffee-price` - Query prices with filters (market, date range, limit)
  - `GET /api/coffee-price/latest` - Latest prices from most recent scrape date
  - Both endpoints JWT-protected, max 365-day query range
- **Dependencies Added:** puppeteer@19.11.1, cheerio@1.2.0

**Technical Details:**
- Logging integration via NestJS Logger
- Error handling with retry delays (30s, 60s) and fallback
- Service-level error logging for scrape failures
- Timestamps on all price records for audit trail

**Files Created:**
- `src/coffee-price/coffee-price.module.ts`
- `src/coffee-price/coffee-price.service.ts`
- `src/coffee-price/coffee-price.controller.ts`
- `src/coffee-price/entities/coffee-price.entity.ts`
- `src/coffee-price/enums/coffee-market.enum.ts`
- `src/coffee-price/dto/query-coffee-price.dto.ts`

---

## Version 1.2 (2026-03-11)

### Added: Farm-Level WebSocket Subscriptions & Conditional FCM

**Feature:** Multi-device event streaming with smart push notification optimization

- **WebSocket Rooms:** Clients can subscribe to entire farm for aggregated events
- **Events Broadcast:** All device telemetry, status, alerts reach farm subscribers
- **Conditional FCM:** Push notifications skip when farm owner has active WebSocket connection
- **Room Management:** Dual-room architecture (device:{id} + farm:{id}) with no duplicate delivery
- **Cache Optimization:** FarmId caching (60s TTL) reduces database queries during high-frequency telemetry
- **Updated Components:**
  - DeviceGateway: Socket.IO room management for farms
  - SyncService: FarmId caching, dual room broadcasts
  - ThresholdService: Conditional FCM checks
  - ScheduleService: Conditional FCM checks
  - SensorService: Event handling for command logging

---

## Version 1.1 (2026-03-03)

### Added: FCM Push Notifications

**Feature:** Real-time push notifications to mobile app

- **Module:** NotificationModule with FcmService, controller, DeviceToken entity
- **Firebase Integration:** Firebase Admin SDK initialization with env var fallback
- **Token Management:** Register/unregister FCM device tokens per platform (iOS/Android)
- **Event Integration:** Threshold alerts and schedule execution trigger FCM
- **Auto-Cleanup:** Stale/invalid tokens automatically removed on send failure
- **Fire-and-Forget:** Service never throws errors to caller (graceful degradation)
- **REST Endpoints:**
  - `POST /api/notification/register-token` - Register device token (upsert)
  - `DELETE /api/notification/unregister-token` - Remove device token
- **Broadcast Capability:** sendToFarmOwner(farmId, notification) via Farm→User join query

---

## Version 1.0 (2026-02-25)

### Complete: Phase 2 - IoT Integration & Real-time Monitoring

**Major Components Delivered:**

**Device Management**
- MQTT client integration (EMQX broker connectivity)
- Device registration, status tracking, token lifecycle
- Device provisioning flow (MQTT-based pairing with 24h pairing token expiry)
- Command execution framework (manual and automated)
- Device status enum: PENDING → PAIRED → ACTIVE/DISABLED

**Real-time Telemetry**
- MQTT topic subscription (device/{id}/telemetry, status, resp)
- Telemetry ingestion pipeline (<500ms latency)
- SensorData time-series storage with bigint auto-increment PK
- WebSocket broadcast to subscribers via Socket.IO /device namespace
- SyncService event bridge (MQTT ↔ WebSocket ↔ Event Emitter)

**Sensor Configuration & Thresholds**
- SensorConfig entity with per-device sensor type management
- SensorThreshold entity with MIN/MAX level support (CRITICAL/WARNING)
- Threshold evaluation with anti-spam (30s cooldown per sensor)
- AlertLog for breach history and acknowledgment tracking

**Automated Commands**
- ThresholdService for automated command dispatch on threshold breach
- Command priority (CRITICAL evaluated before WARNING)
- CommandLog for audit trail (manual vs. automated source tracking)
- MQTT command publication (device/{id}/cmd)

**Device Scheduling**
- ScheduleModule with recurring and one-time command scheduling
- Recurring: daysOfWeek + HH:mm time support
- One-time: executeAt timestamp with auto-disable after execution
- Timezone-aware evaluation using Intl.DateTimeFormat
- Farm-wide and device-specific targeting
- 60-second interval processing with overlap prevention

**MQTT Broker Integration (EMQX)**
- EmqxModule with auth and ACL webhook endpoints
- Device token and pairing token authentication
- Topic-level access control (device-scoped, farm-scoped)
- Device status integration (disabled devices denied connection)

**Data Model (14 Entities)**
- User, ResetToken, Farm, Device, PairingToken
- SensorConfig, SensorThreshold, SensorData, AlertLog, CommandLog
- DeviceSchedule, File, FirebaseConfig

**REST Endpoints (50+ total)**
- Device: 9 endpoints (CRUD + command + status + token mgmt)
- Sensor: 22+ endpoints (config, threshold, data, stats, analytics)
- Schedule: 6 endpoints (CRUD + toggle)
- Provision: 7 endpoints (pairing, token mgmt, status)
- EMQX: 2 webhook endpoints (auth, ACL)

**WebSocket Events** (bi-directional)
- `subscribeToDevice`, `unsubscribeFromDevice`, `sendCommand` (client→server)
- `deviceData`, `deviceStatus`, `deviceAlert`, `deviceProvisioned`, `devicePaired` (server→client)

**Key Architectural Patterns:**
- Dual transport: MQTT for IoT devices, WebSocket for clients
- Event-driven: @nestjs/event-emitter for decoupling
- Time-series: SensorData with indexed queries for analytics
- Anti-spam: In-memory state machine with 30s cooldown
- Caching: 60s TTL for device configs to reduce DB load

---

## Version 0.1 (2025-12-31)

### Complete: Phase 1 - Core Infrastructure

**Authentication & Authorization**
- JWT dual-token strategy (short-lived accessToken, long-lived refreshToken)
- Passport.js integration with local and JWT strategies
- User registration with email uniqueness, password validation
- Login with bcrypt password hashing (7 salt rounds)
- Token refresh endpoint with httpOnly cookie support
- Password change with token version invalidation
- Password reset flow (OTP generation, verification, new password)

**User Management**
- User CRUD operations
- User profile with avatar upload
- PasswordResetService for OTP and reset token lifecycle
- ResetToken entity with expiry and used flag

**Farm Management**
- Farm CRUD operations (create, read, update, delete)
- User-farm association (1:M relationship)
- Farm scoping for multi-user support

**File Upload & Storage**
- Multer disk storage integration
- File entity for metadata tracking
- 5MB file size limit
- Supported formats: jpg, jpeg, png, gif
- Avatar upload for user profiles

**API Documentation**
- Swagger/OpenAPI documentation at `/api`
- @ApiBearerAuth() decorators for JWT documentation
- @ApiTags() decorators for endpoint grouping
- Auto-generated interactive API docs

**Code Standards**
- Prettier (single quotes, trailing commas)
- ESLint configuration
- NestJS module pattern (modules, services, controllers, guards)
- DTO-based input validation
- AutoValidationPipe with whitelist + transform globally

**Development Infrastructure**
- Docker Compose setup (PostgreSQL 14, EMQX 5.4, NestJS)
- TypeORM ORM integration with auto-sync
- Configuration via .env variables
- Error handling and HTTP exception filters

---

**Changelog Maintained By:** Documentation Management System
**Last Updated:** 2026-03-20
**Format:** Semantic Versioning (MAJOR.MINOR.PATCH)
