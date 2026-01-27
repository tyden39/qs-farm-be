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
│   └── SyncService     (MQTT↔WebSocket bridge)
├── ProvisionModule     → MqttService
├── EmqxModule          → JwtModule (MQTT auth/ACL webhooks)
└── FilesModule         (Multer disk storage to ./files)
```

### Key Architectural Patterns

**Dual real-time transport:** IoT devices communicate via MQTT through EMQX broker. Mobile/web clients connect via Socket.IO WebSockets. `SyncService` bridges the two, forwarding MQTT device messages to WebSocket subscribers.

**Device provisioning flow:** Device publishes to `provision/new` → backend generates pairing token (24h expiry) → responds on `provision/resp/{nonce}` → mobile app pairs device with token + farmId → device gets MQTT auth token.

**MQTT topic structure:**
- `provision/new`, `provision/resp/{nonce}` - provisioning
- `device/{deviceId}/cmd` - commands to device
- `device/{deviceId}/status` - device status
- `device/{deviceId}/telemetry` - device data
- `device/{deviceId}/resp` - device responses

**WebSocket authentication:** JWT token verified on Socket.IO handshake. Clients join rooms `device:{deviceId}` to receive targeted broadcasts.

**EMQX integration:** `EmqxModule` exposes webhook endpoints (`/api/emqx/auth`, `/api/emqx/acl`) that EMQX calls to authenticate MQTT clients and check topic ACL permissions.

### Data Model

```
User (1) ──→ (M) Farm (1) ──→ (M) Device
                                    ↕
                              PairingToken (via serial)
```

Entities use UUID primary keys. TypeORM with `synchronize: true` auto-syncs schema. Device has status enum: `PENDING`, `PAIRED`, `ACTIVE`, `DISABLED`.

### Authentication

JWT dual-token strategy: short-lived `accessToken` (Bearer header) + long-lived `refreshToken` (httpOnly cookie). Passwords hashed with bcryptjs (7 salt rounds). Guards: `JwtAuthGuard` for protected REST endpoints, `LocalAuthGuard` for sign-in.

## Code Conventions

- **Prettier:** single quotes, trailing commas
- **File naming:** lowercase with hyphens (`mqtt.service.ts`, `jwt-auth.guard.ts`)
- **Validation:** class-validator decorators on DTOs, AutoValidationPipe with whitelist + transform enabled globally
- **Swagger:** available at `/api`, uses `@ApiBearerAuth()` and `@ApiTags()` decorators
- **File uploads:** Multer disk storage, 5MB limit, jpg/jpeg/png/gif only
