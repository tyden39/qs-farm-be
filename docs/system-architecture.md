# System Architecture

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        IoT Farm Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐        ┌──────────────────┐                    │
│  │   Web/Mobile │        │   IoT Device     │                    │
│  │   Client     │        │   (Solar/Remote) │                    │
│  └──────┬───────┘        └────────┬─────────┘                    │
│         │                         │                              │
│         │  JWT + REST/WS          │  MQTT Protocol              │
│         │                         │                              │
│         ▼                         ▼                              │
│  ┌──────────────────────────────────────┐                        │
│  │         NestJS Backend               │                        │
│  │  ┌────────────────────────────────┐  │                        │
│  │  │  REST API (/api/*)             │  │                        │
│  │  │  - Auth, User, Farm, Device    │  │                        │
│  │  │  - Sensor, Schedule, Reports   │  │                        │
│  │  └────────────────────────────────┘  │                        │
│  │  ┌────────────────────────────────┐  │                        │
│  │  │  Socket.IO Gateway (/device)   │  │◄────── WebSocket       │
│  │  │  - Real-time telemetry         │  │   (Persistent)         │
│  │  │  - Device status updates       │  │                        │
│  │  │  - Alert notifications         │  │                        │
│  │  └────────────────────────────────┘  │                        │
│  │  ┌────────────────────────────────┐  │                        │
│  │  │  MQTT Client (SyncService)     │  │◄────── MQTT (QoS 1)    │
│  │  │  - Device telemetry listener   │  │   (Reliable)           │
│  │  │  - Command publisher           │  │                        │
│  │  │  - Event bridge                │  │                        │
│  │  └────────────────────────────────┘  │                        │
│  │                                       │                        │
│  │  ┌────────────────────────────────┐  │                        │
│  │  │  Business Logic Services       │  │                        │
│  │  │  - DeviceService               │  │                        │
│  │  │  - SensorService               │  │                        │
│  │  │  - ThresholdService            │  │                        │
│  │  │  - ScheduleService             │  │                        │
│  │  │  - AuthService                 │  │                        │
│  │  └────────────────────────────────┘  │                        │
│  │                                       │                        │
│  │  ┌────────────────────────────────┐  │                        │
│  │  │  Event Emitter (Decoupling)    │  │                        │
│  │  │  - telemetry.received          │  │                        │
│  │  │  - command.dispatched          │  │                        │
│  │  └────────────────────────────────┘  │                        │
│  │                                       │                        │
│  └──────┬───────────────────────────────┘                        │
│         │                                                        │
│         │  TypeORM with Synchronize:true                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────┐                        │
│  │     PostgreSQL 14                    │                        │
│  │  - User, Farm, Device entities       │                        │
│  │  - Sensor config, threshold, data    │                        │
│  │  - Alert, Command logs               │                        │
│  │  - Schedule definitions              │                        │
│  └──────────────────────────────────────┘                        │
│         ▲                                                        │
│         │                                                        │
│         └──── EMQX 5.4 (MQTT Broker) ────────────────────┐       │
│              (Handles 500+ device connections)            │       │
│                                                           │       │
└─────────────────────────────────────────────────────────────────┘
```

## Module Dependency Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ AppModule (Main Application)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Core Infrastructure Modules                               │  │
│  │  • ConfigModule (Environment variables)                   │  │
│  │  • EventEmitterModule (Event-driven decoupling)           │  │
│  │  • TypeOrmModule (PostgreSQL ORM)                         │  │
│  │  • ServeStaticModule (Static file serving)                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Authentication Module                                      │  │
│  │  ├── imports: PassportModule, JwtModule, UserModule       │  │
│  │  ├── AuthService (JWT generation, password hashing)       │  │
│  │  ├── AuthController (signup, signin, refresh)             │  │
│  │  ├── JwtAuthGuard (validate Bearer token)                 │  │
│  │  ├── LocalAuthGuard (validate username/password)          │  │
│  │  └── JwtStrategy (extract JWT payload)                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ User Module                                                │  │
│  │  ├── imports: FilesModule                                 │  │
│  │  ├── UserService (CRUD, profile, avatar)                 │  │
│  │  ├── PasswordResetService (OTP, reset flow)               │  │
│  │  ├── User entity (UUID PK, auth fields)                   │  │
│  │  └── ResetToken entity (OTP + token)                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Farm Module                                                │  │
│  │  ├── imports: FilesModule                                 │  │
│  │  ├── FarmService (CRUD, user association)                 │  │
│  │  └── Farm entity (UUID PK, user FK)                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Zone Module (Farm Subdivision & Config Inheritance)        │  │
│  │  ├── imports: DeviceModule, FilesModule                  │  │
│  │  ├── exports: ZoneService, ConfigResolutionService      │  │
│  │  │                                                         │  │
│  │  ├── ZoneService (CRUD for zones)                         │  │
│  │  │   ├── findAllByFarm(farmId)                             │  │
│  │  │   ├── create/update/remove operations                  │  │
│  │  │   └── togglePump(zoneId, action) - broadcast to all   │  │
│  │  │       devices in zone                                  │  │
│  │  │                                                         │  │
│  │  ├── ZoneSensorConfigService (zone template configs)      │  │
│  │  │   ├── CRUD for ZoneSensorConfig entities               │  │
│  │  │   └── CRUD for ZoneThreshold entities                  │  │
│  │  │                                                         │  │
│  │  ├── ConfigResolutionService (runtime inheritance)        │  │
│  │  │   ├── getDeviceContext() - load device + zone + zone  │  │
│  │  │     configs with 60s cache                             │  │
│  │  │   ├── resolveConfig() - pick active irrigationMode +  │  │
│  │  │     controlMode using checkAll logic                  │  │
│  │  │   ├── resolveThresholdsForSensor() - fallback chain:   │  │
│  │  │     device(mode) → device(null) → zone(mode) →        │  │
│  │  │     zone(null)                                          │  │
│  │  │   └── invalidateCache(deviceId/zoneId)                │  │
│  │  │                                                         │  │
│  │  ├── Zone entity (1:M with Device, 1:M with Farm)        │  │
│  │  ├── ZoneSensorConfig entity (zone sensor templates)      │  │
│  │  ├── ZoneThreshold entity (zone thresholds per sensor)    │  │
│  │  └── Zone endpoints:                                       │  │
│  │      GET/POST/PATCH/DELETE /api/zone                      │  │
│  │      GET/POST/PATCH/DELETE /api/zone/:id/sensor-config   │  │
│  │      GET/POST/PATCH/DELETE /api/zone/:id/threshold       │  │
│  │      POST /api/zone/:id/pump                              │  │
│  │                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Device Module (Core IoT)                                   │  │
│  │  ├── imports: JwtModule, ProvisionModule                  │  │
│  │  ├── exports: MqttService, DeviceGateway, SyncService     │  │
│  │  │                                                         │  │
│  │  ├── MqttService                                           │  │
│  │  │   └── MQTT client (connects to EMQX broker)            │  │
│  │  │       • publishToDevice(topic, message)                │  │
│  │  │       • subscribe(topic, callback)                     │  │
│  │  │       • Auto-reconnect on failure                      │  │
│  │  │                                                         │  │
│  │  ├── SyncService                                           │  │
│  │  │   └── Bridges MQTT ↔ WebSocket ↔ Event Emitter         │  │
│  │  │       • Listens to MQTT topics:                        │  │
│  │  │         - device/+/telemetry                           │  │
│  │  │         - device/+/status                              │  │
│  │  │         - device/+/resp                                │  │
│  │  │         - provision/*                                  │  │
│  │  │       • Caches farmId (60s TTL) to enable farm-level   │  │
│  │  │         broadcasts without redundant DB queries        │  │
│  │  │       • Emits domain events:                           │  │
│  │  │         - telemetry.received (includes farmId)         │  │
│  │  │         - command.dispatched                           │  │
│  │  │       • Broadcasts to WebSocket rooms (device + farm)  │  │
│  │  │                                                         │  │
│  │  ├── DeviceGateway                                         │  │
│  │  │   └── Socket.IO namespace /device                      │  │
│  │  │       • JWT auth on handshake                          │  │
│  │  │       • Room management (device:{id}, farm:{id})       │  │
│  │  │       • Events: subscribeToDevice/Farm, sendCommand    │  │
│  │  │       • User connection tracking for FCM optimization  │  │
│  │  │                                                         │  │
│  │  ├── DeviceService (CRUD, status, token mgmt)             │  │
│  │  ├── Device entity (UUID PK, farm FK, status enum)        │  │
│  │  └── PairingToken entity (one-time use)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                   │                                               │
│                   │ Emits telemetry.received                     │
│                   ▼                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Sensor Module (Processing & Alerts)                        │  │
│  │  ├── imports: DeviceModule, NotificationModule            │  │
│  │  │                                                         │  │
│  │  ├── SensorService @OnEvent('telemetry.received')         │  │
│  │  │   ├── Stores readings in SensorData (time-series)      │  │
│  │  │   ├── Evaluates thresholds in SensorConfig             │  │
│  │  │   ├── Triggers ThresholdService on breach              │  │
│  │  │   ├── Caches config (60s TTL)                          │  │
│  │  │   ├── Provides analytics queries                       │  │
│  │  │   └── Logs commands on command.dispatched event        │  │
│  │  │                                                         │  │
│  │  ├── ThresholdService                                      │  │
│  │  │   ├── evaluate(deviceId, farmId, config, value)        │  │
│  │  │   ├── Checks CRITICAL first, then WARNING              │  │
│  │  │   ├── Anti-spam: 30s cooldown per sensor               │  │
│  │  │   ├── Publishes command to device via SyncService      │  │
│  │  │   ├── Broadcasts alert via DeviceGateway               │  │
│  │  │   ├── Conditional FCM: skip if farm owner online (WS)  │  │
│  │  │   └── Logs to CommandLog (source: AUTOMATED)           │  │
│  │  │                                                         │  │
│  │  ├── SensorConfig entity (deviceId, sensorType unique)    │  │
│  │  ├── SensorThreshold entity (config, level, type)         │  │
│  │  ├── SensorData entity (bigint PK, time-series index)     │  │
│  │  ├── AlertLog entity (threshold breach history)           │  │
│  │  └── CommandLog entity (all commands, manual + auto)      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Schedule Module (Command Scheduling)                       │  │
│  │  ├── imports: NestScheduleModule, DeviceModule,           │  │
│  │  │           NotificationModule                            │  │
│  │  │                                                         │  │
│  │  ├── ScheduleService                                       │  │
│  │  │   ├── @Interval(60_000) processSchedules               │  │
│  │  │   ├── Supporting recurring (daysOfWeek + time)         │  │
│  │  │   ├── Supporting one-time (executeAt timestamp)        │  │
│  │  │   ├── Timezone-aware evaluation (Intl API)             │  │
│  │  │   ├── Farm-wide or single-device targeting             │  │
│  │  │   ├── Auto-disable after one-time execution            │  │
│  │  │   ├── Catches up missed executions on restart          │  │
│  │  │   ├── Conditional FCM: skip if farm owner online (WS)  │  │
│  │  │   └── Publishes via SyncService.sendCommandToDevice()  │  │
│  │  │                                                         │  │
│  │  ├── DeviceSchedule entity (recurring + one-time)         │  │
│  │  └── Schedule endpoints (CRUD + toggle)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Provision Module (Device Pairing)                          │  │
│  │  ├── imports: DeviceModule                                │  │
│  │  │                                                         │  │
│  │  ├── ProvisionService                                      │  │
│  │  │   ├── handleProvisionRequest (MQTT provision/new)      │  │
│  │  │   │   • Validate device serial                         │  │
│  │  │   │   • Create Device (PENDING status)                 │  │
│  │  │   │   • Generate PairingToken (24h expiry)             │  │
│  │  │   │   • Respond on provision/resp/{nonce}              │  │
│  │  │   ├── pairDevice (from client)                         │  │
│  │  │   │   • Validate pairing token                         │  │
│  │  │   │   • Set Device to PAIRED, assign farmId            │  │
│  │  │   │   • Generate deviceToken                           │  │
│  │  │   │   • Publish set_owner MQTT command                 │  │
│  │  │   ├── unpairDevice                                      │  │
│  │  │   └── regenerateDeviceToken                            │  │
│  │  │                                                         │  │
│  │  └── Provision endpoints (pair, unpair, token mgmt)       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ EMQX Module (MQTT Broker Integration)                      │  │
│  │  ├── imports: JwtModule                                   │  │
│  │  │                                                         │  │
│  │  ├── EmqxService                                           │  │
│  │  │   ├── POST /api/emqx/auth (webhook from broker)        │  │
│  │  │   │   • Validate device token OR user JWT              │  │
│  │  │   │   • Check device status (disabled = deny)          │  │
│  │  │   │   • Return {allow: true/false}                     │  │
│  │  │   ├── POST /api/emqx/acl (webhook from broker)         │  │
│  │  │   │   • Device: own topics only (device/{id}/*)        │  │
│  │  │   │   • User: farm-scoped topics                       │  │
│  │  │   │   • Return {allow: true/false}                     │  │
│  │  │   └── Topic isolation & farm scoping                   │  │
│  │  │                                                         │  │
│  │  └── EMQX endpoints (auth, ACL validation)                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Notification Module (FCM Push)                             │  │
│  │  ├── imports: TypeOrmModule (DeviceToken)                 │  │
│  │  ├── exports: FcmService                                  │  │
│  │  │                                                         │  │
│  │  ├── FcmService (OnModuleInit)                             │  │
│  │  │   ├── Initializes Firebase Admin SDK on startup        │  │
│  │  │   ├── Graceful degradation if env var not set          │  │
│  │  │   ├── sendToFarmOwner(farmId, notification)            │  │
│  │  │   │   • Queries DeviceToken via Farm → User join       │  │
│  │  │   │   • Sends via sendEachForMulticast                 │  │
│  │  │   │   • Auto-removes stale/invalid tokens on failure   │  │
│  │  │   └── Fire-and-forget (never throws to caller)        │  │
│  │  │                                                         │  │
│  │  ├── NotificationController                                │  │
│  │  │   ├── POST /api/notification/register-token (upsert)   │  │
│  │  │   └── DELETE /api/notification/unregister-token        │  │
│  │  │                                                         │  │
│  │  └── DeviceToken entity (userId FK, token unique, platform)│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Pump Module (Session Tracking & Maintenance)               │  │
│  │  ├── imports: DeviceModule                                │  │
│  │  │                                                         │  │
│  │  ├── PumpService                                           │  │
│  │  │   ├── startSession(deviceId, sensorData)              │  │
│  │  │   ├── stopSession(deviceId, status, reason)           │  │
│  │  │   ├── @OnEvent('pump.started', 'pump.stopped', etc)  │  │
│  │  │   │   └── Events emitted by SyncService from telemetry│  │
│  │  │   │       (parses PUMP_STATUS field from payload)      │  │
│  │  │   ├── @Interval(60_000) closeStaleSession             │  │
│  │  │   │   └── Closes sessions with no data > 30s          │  │
│  │  │   ├── getReport(deviceId) - summary + timeline        │  │
│  │  │   ├── exportToExcel(deviceId) - via exceljs          │  │
│  │  │   ├── Tracks cycles: running hours, cycles count      │  │
│  │  │   └── Maintenance alerts based on thresholds          │  │
│  │  │                                                         │  │
│  │  ├── PumpController                                        │  │
│  │  │   ├── GET /api/pump/report/:deviceId (JSON)          │  │
│  │  │   └── GET /api/pump/report/:deviceId?format=excel    │  │
│  │  │                                                         │  │
│  │  ├── PumpSession entity (tracking pump cycles)           │  │
│  │  ├── PumpSessionStatus enum (active/completed/interruped)│  │
│  │  ├── InterruptedReason enum (lwt/esp_reboot/timeout)    │  │
│  │  └── Event-driven: pump.started, pump.stopped,          │  │
│  │      pump.disconnected                                    │  │
│  │                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Coffee Price Module (Market Intelligence)                  │  │
│  │  ├── imports: none                                         │  │
│  │  │                                                         │  │
│  │  ├── CoffeePriceService                                   │  │
│  │  │   ├── @Cron('0 12 * * *', timezone: 'Asia/Ho_Chi_Minh')│  │
│  │  │   ├── Daily web scrape of giacaphe.com prices         │  │
│  │  │   ├── Puppeteer v19 (headless + Cloudflare handler)  │  │
│  │  │   ├── Cheerio parsing for table extraction           │  │
│  │  │   ├── 3-retry logic (immediate, +30s, +60s delays)   │  │
│  │  │   ├── Stores 7 Vietnamese coffee markets             │  │
│  │  │   ├── findAll(filter: market/date/limit, max 365)    │  │
│  │  │   └── findLatest() - most recent date's prices        │  │
│  │  │                                                         │  │
│  │  ├── CoffeePriceController                                │  │
│  │  │   ├── GET /api/coffee-price (with query filters)      │  │
│  │  │   └── GET /api/coffee-price/latest (JWT protected)   │  │
│  │  │                                                         │  │
│  │  ├── CoffeePrice entity (UUID PK, UNIQUE(date,market))  │  │
│  │  ├── CoffeeMarket enum (7 markets + labels)             │  │
│  │  └── QueryCoffeePriceDto (market, from, to, limit)      │  │
│  │                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Files Module (Upload & Storage)                            │  │
│  │  ├── FilesService (Multer disk storage)                   │  │
│  │  ├── File entity (metadata)                               │  │
│  │  └── Upload/download endpoints                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model (Entity Relationship Diagram)

```
┌──────────────────┐
│     User         │
├──────────────────┤
│ id: UUID (PK)    │
│ username: str    │
│ email: str       │
│ password: hash   │
│ tokenVersion: int│
│ createdAt        │
│ updatedAt        │
└────────┬─────────┘
         │ (1:M)
         │
         ▼
┌──────────────────┐
│     Farm         │
├──────────────────┤
│ id: UUID (PK)    │
│ name: str        │
│ location: str    │
│ userId: UUID (FK)│
│ coordinates:jsonb│
│ createdAt        │
└────────┬─────────┘
         │ (1:M)
         │
         ▼
┌──────────────────────────────────┐
│         Zone                      │
├──────────────────────────────────┤
│ id: UUID (PK)                    │
│ name: str                        │
│ image: str                       │
│ farmId: UUID (FK)                │
│ coordinates: jsonb               │
│ irrigationMode: enum             │
│ controlMode: enum                │
│ checkAll: bool                   │
│ pumpEnabled: bool                │
│ createdAt, updatedAt             │
└────────┬─────────────────────────┘
         │ (1:M)
         │
         ▼
┌──────────────────────────────────┐
│         Device                   │
├──────────────────────────────────┤
│ id: UUID (PK)                    │
│ name: str                        │
│ imei: str (unique)               │
│ serial: str (unique)             │
│ status: enum                     │
│ farmId: UUID (FK)                │
│ zoneId: UUID (FK, nullable)      │
│ latitude, longitude: float       │
│ irrigationMode: enum (nullable)  │
│ controlMode: enum (nullable)     │
│ deviceToken: str                 │
│ operatingLifeHours: float        │
│ totalOperatingHours: float       │
│ provisionedAt, pairedAt          │
│ createdAt, updatedAt             │
└────────┬─────────────────────────┘
         │ (1:M)
         ├───────────────────────────┬──────────────────────┐
         │                           │                      │
         ▼                           ▼                      ▼
┌──────────────────┐    ┌────────────────────┐   ┌──────────────────┐
│ SensorConfig     │    │ SensorData         │   │ AlertLog         │
├──────────────────┤    ├────────────────────┤   ├──────────────────┤
│ id: UUID (PK)    │    │ id: bigint (PK)    │   │ id: UUID (PK)    │
│ deviceId: FK     │    │ deviceId: FK       │   │ deviceId: FK     │
│ sensorType: enum │    │ sensorType: enum   │   │ sensorType: enum │
│ mode: enum       │    │ value: double      │   │ value: double    │
│ enabled: bool    │    │ createdAt (INDEX)  │   │ threshold: float │
│ unique(device,   │    │ [deviceId,created] │   │ level: enum      │
│ sensor)          │    │ [device,sensor,dt] │   │ acknowledged     │
└────────┬─────────┘    └────────────────────┘   └──────────────────┘
         │ (1:M)
         │
         ▼
┌──────────────────────────┐
│ SensorThreshold          │
├──────────────────────────┤
│ id: UUID (PK)            │
│ sensorConfigId: FK       │
│ level: enum (WARNING)    │
│ type: enum (MIN/MAX)     │
│ threshold: float         │
│ irrigationMode: enum (opt)│
│ action: str              │
│ unique(config, level,    │
│ irrigationMode)          │
└──────────────────────────┘

┌──────────────────────────┐
│ ZoneSensorConfig         │
├──────────────────────────┤
│ id: UUID (PK)            │
│ zoneId: UUID (FK)        │
│ sensorType: enum         │
│ enabled: bool            │
│ mode: enum (AUTO)        │
│ unit: str (opt)          │
│ unique(zoneId, sensorType)
│ createdAt, updatedAt     │
└────────┬─────────────────┘
         │ (1:M)
         │
         ▼
┌──────────────────────────┐
│ ZoneThreshold            │
├──────────────────────────┤
│ id: UUID (PK)            │
│ zoneSensorConfigId: FK   │
│ level: enum (CRITICAL)   │
│ irrigationMode: enum (opt)│
│ minThreshold: float (opt)│
│ maxThreshold: float (opt)│
│ action: str              │
│ unique(config, level,    │
│ irrigationMode)          │
│ createdAt, updatedAt     │
└──────────────────────────┘

┌─────────────────────────┐
│ CommandLog              │
├─────────────────────────┤
│ id: UUID (PK)           │
│ deviceId: FK            │
│ command: str            │
│ params: JSONB           │
│ source: enum (MANUAL)   │
│ sensorType: str (opt)   │
│ reason: str (opt)       │
│ success: bool           │
│ errorMessage: str (opt) │
│ createdAt (INDEX)       │
└─────────────────────────┘

┌─────────────────────────┐
│ DeviceSchedule          │
├─────────────────────────┤
│ id: UUID (PK)           │
│ type: enum (RECURRING)  │
│ deviceId: FK (XOR)      │
│ farmId: FK (XOR)        │
│ zoneId: FK (XOR)        │
│ command: str            │
│ params: JSONB           │
│ daysOfWeek: int[]       │
│ time: str (HH:mm)       │
│ executeAt: timestamp    │
│ timezone: str           │
│ enabled: bool           │
│ lastExecutedAt          │
└─────────────────────────┘

┌──────────────────────────┐
│ PairingToken             │
├──────────────────────────┤
│ id: UUID (PK)            │
│ token: str (unique)      │
│ serial: str (unique)     │
│ expiresAt: timestamp     │
│ used: bool               │
│ createdAt                │
└──────────────────────────┘

┌──────────────────────────┐
│ ResetToken               │
├──────────────────────────┤
│ id: UUID (PK)            │
│ userId: UUID (FK)        │
│ otpHash: str             │
│ resetToken: UUID (opt)   │
│ expiresAt: timestamp     │
│ used: bool               │
│ createdAt                │
└──────────────────────────┘

┌──────────────────────────┐
│ DeviceToken              │
├──────────────────────────┤
│ id: UUID (PK)            │
│ userId: UUID (FK)        │
│ token: str (unique)      │
│ platform: enum (IOS      │
│   | ANDROID)             │
│ createdAt                │
│ updatedAt                │
└──────────────────────────┘

┌──────────────────────────┐
│ PumpSession              │
├──────────────────────────┤
│ id: UUID (PK)            │
│ deviceId: UUID (FK)      │
│ sessionId: str (MQTT)    │
│ status: enum (active)    │
│ startedAt: timestamp     │
│ stoppedAt: timestamp     │
│ interruptedReason: enum  │
│ sensorAggregates: JSONB  │
│ createdAt, updatedAt     │
└──────────────────────────┘

┌──────────────────────────┐
│ CoffeePrice              │
├──────────────────────────┤
│ id: UUID (PK)            │
│ date: date               │
│ market: enum (7 mkts)    │
│ price: float             │
│ currency: str (VND)      │
│ unit: str (kg)           │
│ unique(date, market)     │
│ createdAt                │
└──────────────────────────┘
```

## Real-Time Data Flows

### Telemetry Ingestion Flow (MQTT → Database → WebSocket)

```
1. IoT Device publishes to: device/{deviceId}/telemetry
   { "sensorType": "WATER_PRESSURE", "value": 45.2 }

2. MQTT Broker (EMQX) receives and routes message

3. MqttService (connected to broker) receives on subscription

4. SyncService listener processes telemetry event:
   - Validates device exists and status = ACTIVE
   - Caches farmId (60s TTL) to enable farm-level broadcasts
   - Broadcasts via DeviceGateway to device:{deviceId} + farm:{farmId} rooms
   - Emits domain event: 'telemetry.received' (includes farmId)
   - Time: ~10-50ms

5. SensorService @OnEvent('telemetry.received') listener:
   - Inserts reading into SensorData table
   - Retrieves SensorConfig from cache (60s TTL)
   - Uses farmId from event (no Device query needed)
   - Calls ThresholdService.evaluate()
   - Time: ~50-100ms

6. ThresholdService.evaluate():
   - Evaluates CRITICAL level first, then WARNING
   - Checks anti-spam state machine (30s cooldown)
   - If threshold breached:
     a) Publishes command to device/+/cmd via MqttService
     b) Creates CommandLog entry (source: AUTOMATED)
     c) Broadcasts alert via DeviceGateway to device:{id} + farm:{farmId} rooms
     d) Sends FCM only if farm owner is NOT online (WS check via DeviceGateway)
   - Always creates AlertLog entry
   - Time: ~30-80ms

7. DeviceGateway broadcasts telemetry to all subscribers:
   - Emits 'deviceData' to rooms: device:{deviceId} + farm:{farmId}
   - All connected WebSocket clients receive update once (Socket.IO union)
   - Time: ~20-50ms

Total latency: Device → Database: ~100-150ms
             Database → WebSocket client: ~50-100ms
             End-to-end: < 500ms
```

### Command Dispatch Flow (REST/WebSocket → Device)

```
Case 1: Manual Command (REST API or WebSocket)
────────────────────────────────────────────────

1. Client sends POST /api/device/{id}/command
   { "command": "PUMP_ON", "params": { "duration": 300 } }

2. DeviceController validates and calls DeviceService.sendCommand()

3. SyncService.sendCommandToDevice():
   - Publishes to device/{deviceId}/cmd via MqttService
   - Emits event: 'command.dispatched'
   - Time: ~20-40ms

4. SensorService @OnEvent('command.dispatched') listener:
   - Creates CommandLog entry (source: MANUAL)
   - Time: ~10-20ms

5. IoT Device receives on device/{deviceId}/cmd subscription
   - Executes command
   - Publishes response to device/{deviceId}/resp
   - Time: 100-500ms (depends on device)

6. SyncService receives response on device/+/resp:
   - Validates response
   - Updates CommandLog with success/failure
   - Broadcasts to DeviceGateway
   - Time: ~20-40ms

Total latency: API → Device: ~100-600ms (most time is device execution)


Case 2: Automated Command (Threshold Breach)
──────────────────────────────────────────────

1. SensorService detects threshold breach

2. ThresholdService.evaluate() publishes command immediately
   - Same as manual flow steps 3-6
   - Latency: ~100-200ms total
```

### Device Provisioning Flow (MQTT)

```
1. IoT Device publishes to: provision/new
   { "serial": "DEVICE-001", "nonce": "abc123" }

2. SyncService listener handles provision request:
   - Calls ProvisionService.handleProvisionRequest()
   - Validates serial uniqueness
   - Creates Device entity (status: PENDING)
   - Generates PairingToken (24h expiry, one-time use)
   - Time: ~50-100ms

3. Backend publishes response to: provision/resp/{nonce}
   { "token": "pairing_token_xyz", "expiresAt": "2026-02-26T..." }

4. IoT Device receives pairing token

5. Mobile/Web client uses token to call POST /api/provision/pair
   { "token": "pairing_token_xyz", "farmId": "farm-uuid" }

6. ProvisionService.pairDevice():
   - Validates token (not expired, not used)
   - Updates Device (status: PAIRED, farmId, deviceToken)
   - Marks token as used
   - Publishes set_owner command to device/{id}/cmd
   - Time: ~30-60ms

7. Device receives set_owner, stores credentials

8. Device reconnects with deviceToken in MQTT username

9. EmqxService validates token via webhook
   - Device authenticated and authorized
   - Status changes to ACTIVE
```

### Schedule Execution Flow (60-Second Interval)

```
ScheduleService @Interval(60_000):
─────────────────────────────────

1. Every 60 seconds, processSchedules() runs:
   - Guard: `if (executing) return;` (prevent overlap)
   - executing = true

2. Query all enabled schedules from database

3. For each schedule:

   Recurring (daysOfWeek + time):
   ──────────────────────
   - Use Intl.DateTimeFormat with timezone
   - Check if today is in daysOfWeek
   - Check if current time >= schedule.time
   - If yes, execute (send command to device)

   One-time (executeAt timestamp):
   ───────────────────────────────
   - Check if current time >= executeAt
   - If yes, execute and disable schedule

4. For execution:
   - Dispatch command via SyncService.sendCommandToDevice()
   - Emit 'command.dispatched' event
   - Update lastExecutedAt timestamp
   - For one-time: set enabled = false
   - Send FCM only if farm owner is NOT online (WS check via DeviceGateway)
   - Time per schedule: ~20-50ms

5. executing = false (release lock)

Note: Missed executions catch up on next tick (e.g., if service restarted)
```

## MQTT Topic Structure & Message Format

```
Topic: provision/new
Flow: Device → Backend (provisioning request)
Message: { "serial": "DEVICE-001", "nonce": "unique-id" }
Response: provision/resp/{nonce}
{ "token": "pairing-token-xyz", "expiresAt": "2026-02-26T12:00:00Z" }

Topic: device/{deviceId}/cmd
Flow: Backend → Device (command to execute)
Message: { "command": "PUMP_ON", "params": { "duration": 300 } }
Expected Response: device/{deviceId}/resp

Topic: device/{deviceId}/status
Flow: Device → Backend (device status)
Message: { "status": "ACTIVE", "battery": 87, "signal": -65 }
Frequency: Every 5-10 minutes

Topic: device/{deviceId}/telemetry
Flow: Device → Backend (sensor readings)
Message: { "sensorType": "WATER_PRESSURE", "value": 45.2 }
Frequency: Every 30 seconds to 5 minutes (configurable)

Topic: device/{deviceId}/resp
Flow: Device → Backend (command response)
Message: { "command": "PUMP_ON", "success": true, "duration": 300 }
Sent after executing device/{deviceId}/cmd
```

## WebSocket Events (Socket.IO /device Namespace)

```
Client → Server:
────────────────

Event: subscribeToDevice
Payload: { deviceId: string }
Action: Client joins room 'device:{deviceId}'
Effect: Client receives all events for this device

Event: unsubscribeFromDevice
Payload: { deviceId: string }
Action: Client leaves room 'device:{deviceId}'

Event: subscribeToFarm
Payload: { farmId: string }
Action: Client joins room 'farm:{farmId}'
Effect: Client receives ALL device events (telemetry, status, alerts) from all devices in farm

Event: unsubscribeFromFarm
Payload: { farmId: string }
Action: Client leaves room 'farm:{farmId}'

Event: sendCommand
Payload: { deviceId: string, command: string, params?: any }
Action: Calls DeviceService.sendCommand()
Effect: Command published to MQTT device/{id}/cmd


Server → Client:
────────────────

Event: deviceData
Broadcast to: device:{deviceId} + farm:{farmId} rooms
Payload: { deviceId: string, sensorType: string, value: number, timestamp: date }
Trigger: SyncService receives telemetry on device/+/telemetry
Latency: < 100ms after MQTT message
Note: Clients in both rooms receive once (Socket.IO union logic)

Event: deviceStatus
Broadcast to: device:{deviceId} + farm:{farmId} rooms
Payload: { deviceId: string, status: enum, battery?: number, signal?: number }
Trigger: SyncService receives message on device/+/status
Latency: < 100ms

Event: deviceAlert
Broadcast to: device:{deviceId} + farm:{farmId} rooms
Payload: { deviceId: string, sensorType: string, level: enum, value: number, threshold: number, action: string }
Trigger: ThresholdService breaches threshold
Latency: < 200ms after threshold detection

Event: deviceProvisioned
Broadcast to: all clients
Payload: { deviceId: string, serial: string, expiresAt: date }
Trigger: SyncService.handleProvisionRequest()

Event: devicePaired
Broadcast to: all clients
Payload: { deviceId: string, farmId: string, status: "PAIRED" }
Trigger: ProvisionService.pairDevice()
```

## Authentication Flow

### JWT Dual-Token Strategy

```
1. User Registration (POST /api/auth/signUp):
   ─────────────────────────────────────
   - Receive: { email, password, username }
   - Validate input (email unique, password > 8 chars)
   - Hash password with bcryptjs (7 salt rounds)
   - Create User entity with tokenVersion = 0
   - Return: { userId, email }

2. User Login (POST /api/auth/signIn):
   ──────────────────────────────────
   - Receive: { email, password }
   - Validate credentials (bcrypt.compare)
   - Generate tokens:
     a) accessToken (short-lived)
        - Payload: { sub: userId, tokenVersion }
        - Expiry: 60 minutes
        - Delivery: Bearer header
     b) refreshToken (long-lived)
        - Payload: { sub: userId, tokenVersion }
        - Expiry: 30 days
        - Delivery: httpOnly cookie (secure, sameSite)
   - Return: { accessToken, user }
            Cookie: refreshToken

3. Protected Endpoint Access (with JwtAuthGuard):
   ──────────────────────────────────────────────
   - Client sends: Authorization: Bearer {accessToken}
   - JwtStrategy validates token signature
   - Extracts userId and tokenVersion
   - Queries User and validates tokenVersion matches
   - Injects user into request via @CurrentUser() decorator
   - If token invalid/expired: return 401 Unauthorized

4. Token Refresh (POST /api/auth/refresh-token):
   ────────────────────────────────────────────
   - Client sends: refreshToken in httpOnly cookie
   - Validate refreshToken signature and expiry
   - Validate user.tokenVersion matches token
   - Generate new accessToken (same payload)
   - Return: { accessToken }
   - Cookie: refreshToken (refreshed)

5. Password Change (POST /api/auth/change-password):
   ────────────────────────────────────────────────
   - Requires: JwtAuthGuard (authenticated)
   - Receive: { oldPassword, newPassword }
   - Validate old password (bcrypt.compare)
   - Hash new password (7 salt rounds)
   - Increment user.tokenVersion by 1
   - Save to database
   - Effect: All existing tokens invalidated (version mismatch)
   - Client must re-login

6. Password Reset Flow:
   ─────────────────────
   a) User requests reset (POST /api/auth/forgot-password):
      - Receive: { email }
      - Lookup user
      - Generate 6-digit OTP
      - Hash OTP with bcryptjs (7 salt rounds)
      - Create ResetToken entity with otpHash
      - Send OTP via email
      - Return: success

   b) User verifies OTP (POST /api/auth/verify-otp):
      - Receive: { email, otp }
      - Lookup ResetToken by email
      - Compare OTP with otpHash (bcrypt.compare)
      - Generate unique resetToken (UUID)
      - Update ResetToken.resetToken = UUID
      - Return: { resetToken }

   c) User sets new password (POST /api/auth/reset-password):
      - Receive: { resetToken, newPassword }
      - Lookup ResetToken by resetToken UUID
      - Validate not expired and not used
      - Hash new password
      - Update User.password
      - Increment User.tokenVersion
      - Mark ResetToken.used = true
      - Return: success
      - Effect: All existing tokens invalidated
```

## MQTT Device Authentication (EMQX Integration)

```
1. Device connects to MQTT broker with credentials:

   First time (provisioning):
   ──────────────────────────
   MQTT Client Options:
   {
     clientId: "DEVICE-001",
     username: "pairing_token_xyz",  ← pairing token
     password: "" or ignored
   }

   After pairing:
   ──────────────
   MQTT Client Options:
   {
     clientId: "DEVICE-{deviceId}",
     username: device.deviceToken,  ← device-specific token
     password: "" or ignored
   }

2. EMQX receives connection and calls webhook:
   POST http://backend/api/emqx/auth
   {
     clientid: "DEVICE-001",
     username: "pairing_token_xyz",
     password: "",
     ip_addr: "192.168.1.100",
     port: 1883
   }

3. Backend EmqxService validates:
   - If username = pairing token:
     a) Query PairingToken by token
     b) Validate not expired, not used
     c) Return: { allow: true }
   - If username = device token:
     a) Query Device by deviceToken
     b) Validate status ≠ DISABLED
     c) Return: { allow: true }
   - Else:
     - Return: { allow: false }

4. EMQX grants/denies connection

5. After successful connection, device subscribes to:
   - device/{deviceId}/cmd (receive commands)
   - Any other topics configured

6. Device publishes to allowed topics:
   - device/{deviceId}/status
   - device/{deviceId}/telemetry
   - device/{deviceId}/resp

7. For publish/subscribe, EMQX calls ACL webhook:
   POST http://backend/api/emqx/acl
   {
     clientid: "DEVICE-001",
     username: "device_token_xyz",
     topic: "device/abc-123/cmd",
     action: "subscribe"  or  "publish"
   }

8. Backend EmqxService validates topic access:
   - Device can publish to: device/{ownDeviceId}/*
   - Device can subscribe to: device/{ownDeviceId}/*
   - User (if using JWT) can access: farm/{ownFarmId}/*
   - Return: { allow: true/false }
```

---

**Document Version:** 1.6
**Last Updated:** 2026-03-20
**Architecture Pattern:** NestJS 8 with MQTT + WebSocket dual transport + FCM push notifications + Farm-level subscriptions + Zone hierarchy + Config inheritance + Coffee price intelligence + Pump session tracking
