# Codebase Summary

## Overview

**IoT Farm Management Platform** - NestJS 8 monolith with 14 feature modules, ~15,000+ lines of TypeScript source code across 137 files. Combines REST APIs, MQTT IoT communication, WebSocket real-time updates, and advanced features (FCM notifications, coffee price intelligence, pump session tracking).

## Project Statistics

| Metric | Value |
|--------|-------|
| Total Source Files | 137 .ts files |
| Total Lines of Code | ~15,000+ LOC |
| Number of Modules | 14 feature modules |
| Entities | 17 TypeORM entities |
| Endpoints | 60+ REST endpoints |
| WebSocket Events | 10+ Socket.IO events |
| MQTT Topics | 8 topic patterns |

## Module Structure

```
src/
├── app.module.ts                          # Main application module
├── main.ts                                # Application bootstrap
│
├── auth/                                  # Authentication Module
│   ├── auth.module.ts                     # Module definition
│   ├── auth.service.ts                    # Auth logic (signup, signin, refresh)
│   ├── auth.controller.ts                 # Auth endpoints
│   ├── strategies/
│   │   ├── jwt.strategy.ts                # JWT validation strategy
│   │   ├── local.strategy.ts              # Local (username/password) strategy
│   │   └── index.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts              # JWT auth middleware
│   │   ├── local-auth.guard.ts            # Local auth middleware
│   │   └── index.ts
│   └── decorators/
│       └── current-user.decorator.ts      # Extract @CurrentUser
│
├── user/                                  # User Module
│   ├── user.module.ts                     # Module definition
│   ├── user.service.ts                    # User CRUD operations
│   ├── user.controller.ts                 # User endpoints
│   ├── entities/
│   │   └── user.entity.ts                 # User entity
│   ├── dtos/
│   │   ├── create-user.dto.ts
│   │   ├── update-user.dto.ts
│   │   └── user.dto.ts
│   └── password-reset/
│       ├── entities/reset-token.entity.ts # OTP/reset token entity
│       ├── password-reset.service.ts      # Reset flow (OTP, token, password)
│       └── password-reset.controller.ts   # Reset endpoints
│
├── farm/                                  # Farm Module
│   ├── farm.module.ts                     # Module definition
│   ├── farm.service.ts                    # Farm CRUD, user association
│   ├── farm.controller.ts                 # Farm endpoints
│   ├── entities/
│   │   └── farm.entity.ts                 # Farm entity
│   └── dtos/
│       ├── create-farm.dto.ts
│       ├── update-farm.dto.ts
│       └── farm.dto.ts
│
├── device/                                # Device Module (MQTT + WebSocket)
│   ├── device.module.ts                   # Module definition
│   ├── device.service.ts                  # Device CRUD, status, command
│   ├── device.controller.ts               # Device REST endpoints
│   ├── entities/
│   │   ├── device.entity.ts               # Device entity
│   │   └── pairing-token.entity.ts        # One-time pairing token
│   ├── mqtt/
│   │   ├── mqtt.service.ts                # MQTT client (connects to EMQX)
│   │   └── mqtt.module.ts                 # MQTT provider
│   ├── gateway/
│   │   └── device.gateway.ts              # Socket.IO /device namespace
│   ├── services/
│   │   └── sync.service.ts                # MQTT→WebSocket bridge, event emitter
│   ├── dtos/
│   │   ├── create-device.dto.ts
│   │   ├── update-device.dto.ts
│   │   └── device.dto.ts
│   └── interfaces/
│       └── device-command.interface.ts    # Command structure
│
├── sensor/                                # Sensor Module (data, thresholds, alerts)
│   ├── sensor.module.ts                   # Module definition
│   ├── sensor.service.ts                  # Core sensor CRUD, stats, analytics
│   ├── sensor.controller.ts               # Sensor endpoints (50+ methods)
│   ├── entities/
│   │   ├── sensor-config.entity.ts        # Sensor configuration
│   │   ├── sensor-threshold.entity.ts     # Threshold rules (MIN/MAX)
│   │   ├── sensor-data.entity.ts          # Time-series data (bigint PK)
│   │   ├── alert-log.entity.ts            # Alert history
│   │   └── command-log.entity.ts          # All commands (manual + automated)
│   ├── services/
│   │   └── threshold.service.ts           # Threshold evaluation, anti-spam
│   ├── dtos/
│   │   ├── create-sensor-config.dto.ts
│   │   ├── update-sensor-config.dto.ts
│   │   ├── create-sensor-threshold.dto.ts
│   │   └── ...
│   └── enums/
│       ├── sensor-type.enum.ts            # WATER_PRESSURE, FLOW, etc.
│       ├── time-bucket.enum.ts            # HOUR, DAY, WEEK, MONTH
│       └── alert-level.enum.ts            # WARNING, CRITICAL
│
├── schedule/                              # Schedule Module (cron-like scheduling)
│   ├── schedule.module.ts                 # Module definition
│   ├── schedule.service.ts                # Schedule CRUD, 60s interval processing
│   ├── schedule.controller.ts             # Schedule endpoints
│   ├── entities/
│   │   └── device-schedule.entity.ts      # Recurring/one-time schedules
│   └── dtos/
│       ├── create-device-schedule.dto.ts
│       └── update-device-schedule.dto.ts
│
├── provision/                             # Provision Module (device pairing)
│   ├── provision.module.ts                # Module definition
│   ├── provision.service.ts               # Provisioning flow, pairing logic
│   ├── provision.controller.ts            # Provision endpoints
│   └── dtos/
│       ├── pair-device.dto.ts
│       └── provision-request.dto.ts
│
├── emqx/                                  # EMQX Module (MQTT auth/ACL webhooks)
│   ├── emqx.module.ts                     # Module definition
│   ├── emqx.service.ts                    # EMQX integration logic
│   ├── emqx.controller.ts                 # /api/emqx/auth, /api/emqx/acl endpoints
│   └── interfaces/
│       ├── emqx-auth-request.interface.ts # Webhook auth payload
│       └── emqx-acl-request.interface.ts  # Webhook ACL payload
│
├── files/                                 # Files Module (upload/storage)
│   ├── files.module.ts                    # Module definition
│   ├── files.service.ts                   # File operations (Multer disk storage)
│   ├── files.controller.ts                # Upload/download endpoints
│   └── entities/
│       └── file.entity.ts                 # File metadata
│
├── pump/                                  # Pump Module (v1.4 - session tracking)
│   ├── pump.module.ts                     # Module definition
│   ├── pump.service.ts                    # Session lifecycle, Excel export, maintenance
│   ├── pump.controller.ts                 # Report endpoints
│   ├── entities/
│   │   └── pump-session.entity.ts         # Session with 13 aggregate columns
│   ├── dtos/
│   │   └── pump-report.dto.ts             # Report query/response DTOs
│   └── templates/
│       └── pump-report.template.ts        # Excel format definitions
│
├── firmware/                              # Firmware Module (v1.4 - OTA updates)
│   ├── firmware.module.ts                 # Module definition
│   ├── firmware.service.ts                # Upload, versioning, deployment, MD5 checks
│   ├── firmware.controller.ts             # Upload, check-update, deploy endpoints
│   ├── entities/
│   │   ├── firmware.entity.ts             # Firmware version with MD5 checksum
│   │   └── firmware-update-log.entity.ts  # OTA deployment tracking
│   └── dtos/
│       ├── firmware-upload.dto.ts
│       └── firmware-deploy.dto.ts
│
├── notification/                          # Notification Module (v1.1+ - FCM)
│   ├── notification.module.ts             # Module definition
│   ├── fcm.service.ts                     # Firebase Admin SDK integration
│   ├── notification.controller.ts         # Token registration endpoint
│   ├── entities/
│   │   └── device-token.entity.ts         # FCM tokens per user/platform
│   └── dtos/
│       └── register-token.dto.ts
│
├── coffee-price/                          # Coffee Price Module (v1.3 - market intel)
│   ├── coffee-price.module.ts             # Module definition
│   ├── coffee-price.service.ts            # Puppeteer scraping, retry logic
│   ├── coffee-price.controller.ts         # Price query endpoints
│   ├── entities/
│   │   └── coffee-price.entity.ts         # Daily market prices with date+market unique
│   ├── dtos/
│   │   └── coffee-price-query.dto.ts
│   └── schedulers/
│       └── coffee-price.scheduler.ts      # Daily noon scrape (Asia/Ho_Chi_Minh)
│
├── utils/                                 # Utilities
│   ├── pipes/
│   │   └── validation.pipe.ts             # Global AutoValidationPipe
│   ├── validators/
│   │   ├── is-unique.validator.ts         # DB uniqueness validation
│   │   └── is-farm-exists.validator.ts    # Farm existence validation
│   ├── interceptors/
│   │   └── resolve-promises.interceptor.ts # Async property resolution
│   ├── decorators/
│   │   └── public.decorator.ts            # Skip auth marker
│   ├── common/
│   │   ├── infinity-pagination.ts         # Pagination helper
│   │   └── lower-case-transformer.ts      # DTO field transform
│   └── constants.ts                       # App constants
│
└── config/                                # Configuration
    └── database.config.ts                 # TypeORM configuration
```

## Key Entities & Tables

| Entity | File | Purpose | Primary Key |
|--------|------|---------|-------------|
| User | `user/entities/user.entity.ts` | User accounts, auth | UUID |
| ResetToken | `user/password-reset/entities/reset-token.entity.ts` | OTP & reset flow | UUID |
| Farm | `farm/entities/farm.entity.ts` | Farm grouping | UUID |
| Device | `device/entities/device.entity.ts` | IoT devices (now with totalOperatingHours) | UUID |
| PairingToken | `device/entities/pairing-token.entity.ts` | One-time pairing | UUID |
| SensorConfig | `sensor/entities/sensor-config.entity.ts` | Sensor setup | UUID |
| SensorThreshold | `sensor/entities/sensor-threshold.entity.ts` | Alert rules | UUID |
| SensorData | `sensor/entities/sensor-data.entity.ts` | Readings (time-series) | bigint |
| AlertLog | `sensor/entities/alert-log.entity.ts` | Alert history | UUID |
| CommandLog | `sensor/entities/command-log.entity.ts` | Command audit (MANUAL/AUTOMATED source) | UUID |
| DeviceSchedule | `schedule/entities/device-schedule.entity.ts` | Scheduled commands | UUID |
| File | `files/entities/file.entity.ts` | File metadata | UUID |
| PumpSession | `pump/entities/pump-session.entity.ts` | Pump lifecycle tracking (ACTIVE/COMPLETED/INTERRUPTED) | UUID |
| Firmware | `firmware/entities/firmware.entity.ts` | Firmware versions with MD5 checksums | UUID |
| FirmwareUpdateLog | `firmware/entities/firmware-update-log.entity.ts` | OTA deployment tracking | UUID |
| DeviceToken | `notification/entities/device-token.entity.ts` | FCM push notification tokens | UUID |
| CoffeePrice | `coffee-price/entities/coffee-price.entity.ts` | Daily Vietnamese market prices | UUID |

## Critical Service Classes

### Authentication & User
- **AuthService** (`src/auth/auth.service.ts`) - JWT generation, password hashing, token refresh
- **UserService** (`src/user/user.service.ts`) - User CRUD, profile management
- **PasswordResetService** (`src/user/password-reset/password-reset.service.ts`) - OTP generation, token validation

### Device & MQTT
- **MqttService** (`src/device/mqtt/mqtt.service.ts`) - MQTT client, publish/subscribe, connection management
- **DeviceService** (`src/device/device.service.ts`) - Device CRUD, status, token generation
- **SyncService** (`src/device/services/sync.service.ts`) - MQTT event processing, WebSocket broadcasting, event emission
- **ProvisionService** (`src/provision/provision.service.ts`) - Device provisioning flow, pairing logic

### Sensor & Threshold
- **SensorService** (`src/sensor/sensor.service.ts`) - Sensor config, data aggregation, statistics, analytics
- **ThresholdService** (`src/sensor/services/threshold.service.ts`) - Threshold evaluation, anti-spam, command dispatch, FCM notifications

### Scheduling
- **ScheduleService** (`src/schedule/schedule.service.ts`) - Schedule CRUD, 60-second interval processing, conditional FCM push
- **CoffeePriceScheduler** (`src/coffee-price/schedulers/coffee-price.scheduler.ts`) - Daily noon scrape with retry logic

### Pump Session Tracking
- **PumpService** (`src/pump/pump.service.ts`) - Session lifecycle, event-driven tracking, Excel export, maintenance prediction

### Firmware Management
- **FirmwareService** (`src/firmware/firmware.service.ts`) - Version management, MD5 checksums, OTA deployment

### Notifications
- **FcmService** (`src/notification/fcm.service.ts`) - Firebase Admin SDK integration, token management, multi-platform push
- **CoffeePriceService** (`src/coffee-price/coffee-price.service.ts`) - Puppeteer scraping, Cloudflare handling, data persistence

### EMQX Integration
- **EmqxService** (`src/emqx/emqx.service.ts`) - MQTT auth validation, topic ACL enforcement

### Real-time Gateway
- **DeviceGateway** (`src/device/gateway/device.gateway.ts`) - Socket.IO namespace, WebSocket room management (device + farm rooms)

## Dependency Graph

```
AppModule
├── ConfigModule                          (environment config)
├── EventEmitterModule                    (event-driven decoupling)
├── TypeOrmModule                         (PostgreSQL ORM)
├── ServeStaticModule                     (static file serving)
│
├── AuthModule                            (JWT + Passport)
│   └── imports: PassportModule, JwtModule, UserModule
│
├── UserModule                            (user & password reset)
│   └── imports: FilesModule
│
├── FarmModule                            (farm management)
│   └── imports: FilesModule
│
├── DeviceModule                          (MQTT + WebSocket core)
│   ├── imports: JwtModule, ProvisionModule
│   ├── exports: MqttService, DeviceGateway, SyncService, DeviceService
│   └── contains: MqttService, DeviceGateway, SyncService
│
├── SensorModule                          (telemetry & alerts)
│   ├── imports: DeviceModule, NotificationModule
│   └── listens to: telemetry.received, command.dispatched events
│
├── ScheduleModule                        (device scheduling)
│   ├── imports: NestScheduleModule, DeviceModule, NotificationModule
│   └── 60-second interval processor with conditional FCM
│
├── ProvisionModule                       (device pairing)
│   └── imports: DeviceModule
│
├── PumpModule                            (pump session tracking - v1.4)
│   ├── imports: DeviceModule
│   ├── @OnEvent('pump.started', 'pump.stopped', 'pump.disconnected')
│   └── Excel export, maintenance prediction
│
├── FirmwareModule                        (OTA updates - v1.4)
│   └── Versioning, MD5 checksums, deployment tracking
│
├── NotificationModule                    (FCM pushes - v1.1+)
│   ├── FcmService (Firebase Admin SDK)
│   └── Token management per user/platform
│
├── CoffeePriceModule                     (market intelligence - v1.3)
│   ├── imports: NestScheduleModule
│   ├── Puppeteer scraping, retry logic
│   └── Daily noon schedule (Asia/Ho_Chi_Minh timezone)
│
├── EmqxModule                            (MQTT auth/ACL webhooks)
│   └── imports: JwtModule
│
└── FilesModule                           (file upload/storage)
```

## REST Endpoint Summary

### Authentication (`/api/auth`)
- `POST /signUp` - User registration
- `POST /signIn` - JWT issuance
- `POST /refresh-token` - Token refresh
- `POST /forgot-password` - OTP email
- `POST /verify-otp` - OTP validation
- `POST /reset-password` - Set new password
- `POST /change-password` - Password change (authenticated)

### User (`/api/user`)
- `GET /:id` - Get user by ID
- `GET` - Get current user
- `PATCH /:id` - Update user
- `DELETE /:id` - Delete user
- `POST /avatar` - Upload avatar
- `DELETE` - Delete all users (admin)

### Farm (`/api/farm`)
- `POST` - Create farm
- `GET` - List farms
- `GET /:id` - Get farm details
- `PATCH /:id` - Update farm
- `DELETE /:id` - Delete farm

### Device (`/api/device`)
- `POST` - Create device
- `GET` - List devices
- `GET /:id` - Get device details
- `PATCH /:id` - Update device
- `DELETE /:id` - Delete device
- `POST /:id/command` - Send device command
- `GET /:id/status` - Get device status
- `POST /:id/regenerate-token` - Regenerate device token
- `POST /:id/unpair` - Unpair from farm

### Sensor (`/api/sensor` - 22+ endpoints)
- Config CRUD: `POST /config`, `GET /config`, `GET /config/:id`, `PATCH /config/:id`, `DELETE /config/:id`
- Threshold CRUD: `POST /threshold`, `GET /threshold`, `PATCH /threshold/:id`, `DELETE /threshold/:id`
- Data queries: `GET /data`, `GET /data/latest`, `GET /device/:deviceId/data`
- Analytics: `GET /stats`, `GET /timeseries`, `GET /device/:deviceId/comparison`
- Alerts: `GET /alerts`, `GET /alert-summary`, `POST /alerts/:id/acknowledge`
- Reports: `GET /farm/:farmId/dashboard`, `GET /farm/:farmId/alerts`, `GET /system/overview`

### Schedule (`/api/schedule`)
- `POST` - Create schedule
- `GET` - List schedules
- `GET /:id` - Get schedule
- `PATCH /:id` - Update schedule
- `DELETE /:id` - Delete schedule
- `POST /:id/toggle` - Enable/disable schedule

### Provision (`/api/provision`)
- `GET /status/:serial` - Device provision status
- `POST /pair` - Pair device to farm
- `POST /:deviceId/unpair` - Unpair device
- `POST /:deviceId/regenerate-token` - Regenerate token
- `GET /pairing-tokens` - List pairing tokens
- `DELETE/:id` - Delete pairing token
- `DELETE` - Delete all pairing tokens

### Files (`/api/files`)
- `POST /upload` - Upload file (Multer)
- `GET /:filename` - Download file (public)

### Pump (`/api/pump` - v1.4)
- `GET /report/:deviceId` - Pump session report (query: from, to, format=excel)

### Firmware (`/api/firmware` - v1.4)
- `POST /upload` - Upload firmware version with MD5 checksum
- `GET /check-update` - Check for firmware updates available
- `POST /deploy` - Deploy firmware to device (OTA)
- `GET /logs/:deviceId` - Firmware update deployment logs

### Notification (`/api/notification` - v1.1+)
- `POST /register-token` - Register FCM push notification token

### Coffee Price (`/api/coffee-price` - v1.3)
- `GET` - Query daily prices (filters: date, market, limit=365 days max)
- `GET /latest` - Get latest prices by market

### EMQX (`/api/emqx` - Webhook endpoints)
- `POST /auth` - MQTT device authentication
- `POST /acl` - Topic ACL validation

## WebSocket Events (Socket.IO)

### Client → Server (emit)
- `subscribeToDevice` - Join `device:{id}` room
- `unsubscribeFromDevice` - Leave device room
- `subscribeToFarm` - Join `farm:{id}` room (v1.2+, multi-device events)
- `unsubscribeFromFarm` - Leave farm room
- `sendCommand` - Send command to device

### Server → Client (broadcast)
- `deviceData` - Telemetry update (broadcast to device + farm rooms)
- `deviceStatus` - Device status change (broadcast to device + farm rooms)
- `deviceAlert` - Threshold alert (broadcast to device + farm rooms)
- `deviceProvisioned` - Provisioning complete
- `devicePaired` - Device paired to farm
- `pumpSessionStarted` - Pump session began (v1.4)
- `pumpSessionStopped` - Pump session completed (v1.4)

## MQTT Topic Structure

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `provision/new` | Device → Backend | Device provisioning request |
| `provision/resp/{nonce}` | Backend → Device | Provisioning response with token |
| `device/{id}/cmd` | Backend → Device | Command to device |
| `device/{id}/status` | Device → Backend | Device status update |
| `device/{id}/telemetry` | Device → Backend | Sensor telemetry data (includes PUMP_STATUS for pump.started/stopped events) |
| `device/{id}/resp` | Device → Backend | Command response |
| `device/{id}/pump/session` | Device → Backend | Pump session lifecycle data (v1.4) |
| `firmware/{id}/update` | Backend → Device | Firmware OTA update command (v1.4) |

## Code Patterns & Conventions

### NestJS Patterns
- **Modules**: Feature-based organization with explicit exports
- **Services**: Business logic, database operations, external integrations
- **Controllers**: Request validation, response formatting, routing
- **Guards**: JWT and Local Passport authentication
- **Decorators**: Custom @CurrentUser, @Public, validators
- **Pipes**: Global validation, transformation, error handling
- **Interceptors**: Promise resolution, response formatting
- **Event Emitter**: Decoupled event-driven communication

### TypeORM Patterns
- **Entities**: UUID primary keys (except SensorData), unique constraints, foreign keys
- **Relations**: OneToMany, ManyToOne with cascade delete
- **Migrations**: Not used (synchronize: true)
- **Queries**: Repository pattern with custom queries for aggregation

### Validation
- **DTOs**: class-validator decorators (IsString, IsNumber, IsEnum, etc.)
- **Global Pipe**: AutoValidationPipe with whitelist and transform enabled
- **Custom Validators**: @IsUnique, @IsFarmExists decorators

### Error Handling
- **HttpException**: Standard NestJS exception throwing
- **Status Codes**: 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 422 (Validation), 500 (Server)
- **Try-Catch**: For MQTT operations, external API calls

### Pagination
- **infinityPagination()** helper: Offset/limit with total count
- **Default limit**: 10, **max limit**: 100

## File Size Distribution

| Category | Typical Size | Examples |
|----------|--------------|----------|
| Entities | 30-80 lines | `device.entity.ts`, `user.entity.ts` |
| DTOs | 20-50 lines | `create-farm.dto.ts`, `update-device.dto.ts` |
| Services | 100-300 lines | `device.service.ts`, `user.service.ts` |
| Controllers | 80-200 lines | `device.controller.ts`, `sensor.controller.ts` |
| Gateways | 100-150 lines | `device.gateway.ts` |
| Large Services | 400-700 lines | `sensor.service.ts`, `sync.service.ts` |

## Development Workflow

### Building
```bash
yarn build         # NestJS compilation to dist/
```

### Development
```bash
yarn start:dev     # Hot reload with ts-node
```

### Testing
```bash
yarn test          # Jest unit tests
yarn test:e2e      # E2E test suite
yarn test:cov      # Coverage report
```

### Code Quality
```bash
yarn lint          # ESLint with auto-fix
yarn format        # Prettier formatting
```

## Performance Considerations

### Database Optimization
- Indexes on: (deviceId, createdAt), (deviceId, sensorType, createdAt) for time-series
- Indexes on: pump_session (deviceId, createdAt), coffee_price (date, market) for new modules
- Unique constraints on device serial/IMEI, sensor config (deviceId, sensorType)
- Unique constraint on coffee_price (date, market)
- Bigint PK for SensorData (1B+ row capacity for time-series)

### Caching
- Sensor config cache: 60-second TTL in-memory
- FarmId cache (SyncService): 60-second TTL for reduced DB load
- Device status: In-memory per-service
- JWT secret: Loaded once at startup

### Pagination
- Default 10 items per page, max 100
- Offset/limit pattern
- Total count included for UI pagination

### Async Operations
- Non-blocking MQTT publish
- Promise resolution interceptor for nested relations
- Batch inserts for high-frequency telemetry

---

**Document Version:** 1.1
**Last Updated:** 2026-03-18
**Source LOC:** ~15,000+ across 137 files
**Latest Features:** Pump Session Tracking (v1.4), Firmware OTA (v1.4), Coffee Price Intelligence (v1.3), FCM Notifications (v1.1+), Farm-level WebSocket (v1.2+)
