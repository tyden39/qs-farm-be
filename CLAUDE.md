# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
yarn install              # Install dependencies
yarn start:dev            # Development with hot reload
yarn build                # Production build (outputs to dist/)
yarn start:prod           # Run production build
docker-compose up         # Start PostgreSQL + EMQX + NestJS
yarn lint                 # ESLint with auto-fix
yarn format               # Prettier formatting
yarn test                 # Unit tests (Jest)
yarn test:watch           # Unit tests in watch mode
yarn test:e2e             # End-to-end tests
yarn test:cov             # Tests with coverage report
```

## Environment Setup

Copy `.env.example` to `.env`. Required variables: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_NAME`, `DB_PASS`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`. Docker Compose provides PostgreSQL (port 5432) and EMQX broker (MQTT 1883, WebSocket 8083, Dashboard 18083).

## Architecture

This is a **NestJS 8** IoT farm management platform combining REST API, WebSocket (Socket.IO), and MQTT for real-time device communication.

### Module Dependency Graph

```
AppModule
├── AuthModule          → UserModule, PassportModule, JwtModule
├── UserModule          → FilesModule
├── FarmModule          → FilesModule
├── DeviceModule        → FilesModule, JwtModule, ProvisionModule
│   ├── MqttService     (MQTT client connection)
│   ├── DeviceGateway   (Socket.IO /device namespace)
│   └── SyncService     (MQTT↔WebSocket bridge, emits telemetry events)
├── SensorModule        → DeviceModule (listens to telemetry + command events)
│   ├── SensorService   (telemetry processing, config caching, CRUD, reports/stats)
│   └── ThresholdService(threshold evaluation, command dispatch, anti-spam, command logging)
├── ScheduleModule      → DeviceModule, @nestjs/schedule
│   └── ScheduleService (recurring/one-time command scheduling, 60s interval engine)
├── ProvisionModule     → MqttService
├── EmqxModule          → JwtModule (MQTT auth/ACL webhooks)
├── EventEmitterModule  (decouples DeviceModule ↔ SensorModule)
└── FilesModule         (Multer disk storage to ./files)
```

### Key Architectural Patterns

**Dual real-time transport:** IoT devices communicate via MQTT through EMQX broker. Mobile/web clients connect via Socket.IO WebSockets. `SyncService` bridges the two, forwarding MQTT device messages to WebSocket subscribers.

**Sensor processing pipeline:** `SyncService` emits `telemetry.received` events via `@nestjs/event-emitter`. `SensorService` listens with `@OnEvent`, stores readings in `sensor_data`, evaluates thresholds (CRITICAL first, then WARNING), and dispatches MQTT commands + WebSocket alerts via `ThresholdService`. Anti-spam uses in-memory state machine + 30s cooldown. Sensor configs are cached with 60s TTL.

**Command logging:** All commands are persisted to `CommandLog` entity (indexed on `deviceId + createdAt`). Automated commands (from `ThresholdService`) are logged directly with `source: AUTOMATED`. Manual commands (from `SyncService.sendCommandToDevice()`) emit `command.dispatched` events, and `SensorService` listens via `@OnEvent` to persist them with `source: MANUAL`. Both success and failure are recorded.

**Reports & statistics:** `SensorService` provides aggregation queries using PostgreSQL `DATE_TRUNC` for time-series bucketing (`TimeBucket` enum: hour/day/week/month). Device-level: stats (min/max/avg), timeseries, alert summary, command history. Farm-level: dashboard (all devices + latest readings), alert overview, cross-device sensor comparison. System-level: devices by status, alerts by level, active devices in last 24h.

**Device provisioning flow:** Device publishes to `provision/new` → backend generates pairing token (24h expiry) → responds on `provision/resp/{nonce}` → mobile app pairs device with token + farmId → device gets MQTT auth token.

**MQTT topic structure:**
- `provision/new`, `provision/resp/{nonce}` - provisioning
- `device/{deviceId}/cmd` - commands to device
- `device/{deviceId}/status` - device status
- `device/{deviceId}/telemetry` - device data
- `device/{deviceId}/resp` - device responses

**WebSocket authentication:** JWT token verified on Socket.IO handshake. Clients join rooms `device:{deviceId}` to receive targeted broadcasts.

**Device scheduling:** `ScheduleModule` uses `@nestjs/schedule` v1.1.0 with `@Interval(60_000)` to check for due schedules. Supports `recurring` (daysOfWeek + HH:mm time) and `one_time` (executeAt timestamp) types. Schedules target a single device (`deviceId`) or all devices in a farm (`farmId`). Commands dispatched via `SyncService.sendCommandToDevice()`. Timezone conversion via `Intl.DateTimeFormat`. One-time schedules auto-disable after execution; missed ones catch up on next tick.

**EMQX integration:** `EmqxModule` exposes webhook endpoints (`/api/emqx/auth`, `/api/emqx/acl`) that EMQX calls to authenticate MQTT clients and check topic ACL permissions.

### Data Model

```
User (1) ──→ (M) Farm (1) ──→ (M) Device (1) ──→ (M) SensorConfig (1) ──→ (M) SensorThreshold
                    │               ↕                      │
                    │         PairingToken            SensorData (bigint PK)
                    │         (via serial)            AlertLog
                    │               │                 CommandLog (automated + manual)
                    └───────────────┴──→ (M) DeviceSchedule (recurring/one-time commands)
```

Entities use UUID primary keys (except `SensorData` which uses bigint auto-increment for time-series performance). TypeORM with `synchronize: true` auto-syncs schema. Device has status enum: `PENDING`, `PAIRED`, `ACTIVE`, `DISABLED`. SensorConfig has unique constraint on `(deviceId, sensorType)`. SensorThreshold has unique constraint on `(sensorConfigId, level)`.

### Authentication

JWT dual-token strategy: short-lived `accessToken` (Bearer header) + long-lived `refreshToken` (httpOnly cookie). Passwords hashed with bcryptjs (7 salt rounds). Guards: `JwtAuthGuard` for protected REST endpoints, `LocalAuthGuard` for sign-in.

## Code Conventions

- **Prettier:** single quotes, trailing commas
- **File naming:** lowercase with hyphens (`mqtt.service.ts`, `jwt-auth.guard.ts`)
- **Validation:** class-validator decorators on DTOs, AutoValidationPipe with whitelist + transform enabled globally
- **Swagger:** available at `/api`, uses `@ApiBearerAuth()` and `@ApiTags()` decorators
- **File uploads:** Multer disk storage, 5MB limit, jpg/jpeg/png/gif only
