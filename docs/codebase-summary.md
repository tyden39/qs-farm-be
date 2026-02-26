# Codebase Summary

## Overview

**IoT Farm Management Platform** - NestJS 8 monolith with 13 feature modules, ~5,578 lines of TypeScript source code across 103 files. Combines REST APIs, MQTT IoT communication, and WebSocket real-time updates.

## Project Statistics

| Metric | Value |
|--------|-------|
| Total Source Files | 103 .ts files |
| Total Lines of Code | ~5,578 LOC |
| Number of Modules | 13 feature modules |
| Entities | 14 TypeORM entities |
| Endpoints | 50+ REST endpoints |
| WebSocket Events | 10+ Socket.IO events |
| MQTT Topics | 6 topic patterns |

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
| Device | `device/entities/device.entity.ts` | IoT devices | UUID |
| PairingToken | `device/entities/pairing-token.entity.ts` | One-time pairing | UUID |
| SensorConfig | `sensor/entities/sensor-config.entity.ts` | Sensor setup | UUID |
| SensorThreshold | `sensor/entities/sensor-threshold.entity.ts` | Alert rules | UUID |
| SensorData | `sensor/entities/sensor-data.entity.ts` | Readings (time-series) | bigint |
| AlertLog | `sensor/entities/alert-log.entity.ts` | Alert history | UUID |
| CommandLog | `sensor/entities/command-log.entity.ts` | Command audit | UUID |
| DeviceSchedule | `schedule/entities/device-schedule.entity.ts` | Scheduled commands | UUID |
| File | `files/entities/file.entity.ts` | File metadata | UUID |

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
- **ThresholdService** (`src/sensor/services/threshold.service.ts`) - Threshold evaluation, anti-spam, command dispatch

### Scheduling
- **ScheduleService** (`src/schedule/schedule.service.ts`) - Schedule CRUD, 60-second interval processor

### EMQX Integration
- **EmqxService** (`src/emqx/emqx.service.ts`) - MQTT auth validation, topic ACL enforcement

### Real-time Gateway
- **DeviceGateway** (`src/device/gateway/device.gateway.ts`) - Socket.IO namespace, WebSocket room management

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
│   ├── imports: DeviceModule
│   └── listens to: telemetry.received, command.dispatched events
│
├── ScheduleModule                        (device scheduling)
│   ├── imports: NestScheduleModule, DeviceModule
│   └── 60-second interval processor
│
├── ProvisionModule                       (device pairing)
│   └── imports: DeviceModule
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

### EMQX (`/api/emqx` - Webhook endpoints)
- `POST /auth` - MQTT device authentication
- `POST /acl` - Topic ACL validation

## WebSocket Events (Socket.IO)

### Client → Server (emit)
- `subscribeToDevice` - Join `device:{id}` room
- `unsubscribeFromDevice` - Leave room
- `sendCommand` - Send command to device

### Server → Client (broadcast)
- `deviceData` - Telemetry update
- `deviceStatus` - Device status change
- `deviceAlert` - Threshold alert
- `deviceProvisioned` - Provisioning complete
- `devicePaired` - Device paired to farm

## MQTT Topic Structure

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `provision/new` | Device → Backend | Device provisioning request |
| `provision/resp/{nonce}` | Backend → Device | Provisioning response with token |
| `device/{id}/cmd` | Backend → Device | Command to device |
| `device/{id}/status` | Device → Backend | Device status update |
| `device/{id}/telemetry` | Device → Backend | Sensor telemetry data |
| `device/{id}/resp` | Device → Backend | Command response |

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
- Unique constraints on device serial/IMEI, sensor config (deviceId, sensorType)
- Bigint PK for SensorData (1B+ row capacity for time-series)

### Caching
- Sensor config cache: 60-second TTL in-memory
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

**Document Version:** 1.0
**Last Updated:** 2026-02-25
**Source LOC:** ~5,578 across 103 files
