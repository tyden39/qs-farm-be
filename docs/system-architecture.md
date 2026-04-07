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
│  │  ├── ZoneService: CRUD + togglePump, 60s cache            │  │
│  │  ├── ZoneSensorConfigService: template configs + thresholds│  │
│  │  ├── ConfigResolutionService: threshold fallback chain    │  │
│  │  └── Zone endpoints: /api/zone (CRUD), sensor-config, etc │  │
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
│  │ Gateway Module (LoRa Gateway Management)                   │  │
│  │  ├── imports: JwtModule, ProvisionModule                  │  │
│  │  │                                                         │  │
│  │  ├── GatewayService (CRUD, pairing, status)               │  │
│  │  │   ├── handleProvisionRequest (provision/gateway/new)   │  │
│  │  │   │   • Validate gateway serial + nonce                │  │
│  │  │   │   • Create Gateway (PENDING status)                │  │
│  │  │   │   • Generate PairingToken (24h expiry)             │  │
│  │  │   │   • Respond on provision/resp/{nonce}              │  │
│  │  │   ├── pairGateway (POST /api/provision/gateway/pair)   │  │
│  │  │   │   • Validate pairing token                         │  │
│  │  │   │   • Set Gateway to PAIRED, assign farmId           │  │
│  │  │   │   • Generate mqttToken                             │  │
│  │  │   │   • Publish {gatewayId, mqttToken} to gateway      │  │
│  │  │   ├── isGatewayOnline (lastSeenAt < 90s)              │  │
│  │  │   └── updateLastSeen (from heartbeat on gateway topic) │  │
│  │  │                                                         │  │
│  │  ├── GatewayController                                     │  │
│  │  │   ├── POST /api/provision/gateway/pair                 │  │
│  │  │   ├── GET /api/gateways                                │  │
│  │  │   ├── GET /api/gateways/:id                            │  │
│  │  │   └── GET /api/gateways/:id/status                     │  │
│  │  │                                                         │  │
│  │  ├── Gateway entity (serial, firmware, status, farmId)    │  │
│  │  └── GatewayPairingToken entity (same structure as Device)│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ EMQX Module (MQTT Broker Integration)                      │  │
│  │  ├── imports: JwtModule                                   │  │
│  │  │                                                         │  │
│  │  ├── EmqxService                                           │  │
│  │  │   ├── POST /api/emqx/auth (webhook from broker)        │  │
│  │  │   │   • Validate device token OR gateway token OR JWT  │  │
│  │  │   │   • Check device/gateway status (disabled = deny)  │  │
│  │  │   │   • Gateway: username = gateway:{gwId}             │  │
│  │  │   │   • Return {allow: true/false}                     │  │
│  │  │   ├── POST /api/emqx/acl (webhook from broker)         │  │
│  │  │   │   • Device: device/{id}/* only                     │  │
│  │  │   │   • Gateway: device/+/*, provision/resp/+,         │  │
│  │  │   │     gateway/{gwId}/ota, gateway/{gwId}/device-ota  │  │
│  │  │   │   • Return {allow: true/false}                     │  │
│  │  │   └── Topic isolation & farm scoping                   │  │
│  │  │                                                         │  │
│  │  └── EMQX endpoints (auth, ACL validation)                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Notification Module (FCM Push)                             │  │
│  │  ├── FcmService: Firebase Admin SDK, sendToFarmOwner()     │  │
│  │  ├── Controller: POST/DELETE /api/notification/-token      │  │
│  │  └── DeviceToken entity (userId FK, token unique)          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Pump Module (Session Tracking & Maintenance)               │  │
│  │  ├── PumpService: startSession, stopSession, getReport,    │  │
│  │  │   exportToExcel, event-driven (pump.started/stopped)    │  │
│  │  └── PumpController: GET /api/pump/report (JSON/Excel)     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Coffee Price Module (Market Intelligence)                  │  │
│  │  ├── Daily @Cron scrape of giacaphe.com (Puppeteer)       │  │
│  │  ├── GET /api/coffee-price (filters), /latest (JWT)       │  │
│  │  └── CoffeePrice entity (date + market unique)            │  │
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
└────────┬────────────┬────────┘
         │ (1:M)      │ (1:M)
         │            │
         ▼            ▼
┌──────────────────────────┐
│      Gateway             │
├──────────────────────────┤
│ id: UUID (PK)            │
│ serial: str (unique)     │
│ hardwareVersion: str     │
│ firmwareVersion: str     │
│ status: enum             │
│ farmId: UUID (FK)        │
│ lastSeenAt: timestamp    │
│ mqttToken: str           │
│ pairedAt, createdAt      │
└──────────────────────────┘

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
│ lastSeenAt: timestamp (nullable) │
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

Topic: provision/gateway/new
Flow: Gateway → Backend (gateway provisioning request)
Message: { "serial": "GW-001", "nonce": "unique-id" }
Response: provision/resp/{nonce}
{ "token": "gateway-pairing-token-xyz", "expiresAt": "2026-02-26T12:00:00Z" }

Topic: device/{deviceId}/status
Flow: Type "heartbeat" updates Device.lastSeenAt; Type "lwt" (last-will) sets lastSeenAt = null
Message: { "type": "heartbeat" } or { "reason": "lwt" }

Topic: gateway/{gatewayId}/ota
Flow: Backend → Gateway (OTA update)
Message: { "url": "https://...", "checksum": "sha256:...", "version": "2.0.1" }

Topic: gateway/{gatewayId}/device-ota
Flow: Backend → Gateway → Device (device OTA routed through gateway)
Message: { "deviceId": "dev-id", "url": "https://...", "checksum": "...", "version": "..." }
```
## Device & Gateway Online Status

All devices and gateways report online status via `lastSeenAt` timestamp:

```
Online Check:  lastSeenAt != null AND (now - lastSeenAt) < 90 seconds

Status Updates:
┌─────────────────────────────┬──────────────────────────────────────┐
│ MQTT Topic                  │ Effect                               │
├─────────────────────────────┼──────────────────────────────────────┤
│ device/{id}/status          │ Heartbeat: update Device.lastSeenAt  │
│ (type: "heartbeat")         │ (prevents stale status)              │
├─────────────────────────────┼──────────────────────────────────────┤
│ device/{id}/status          │ LWT: set Device.lastSeenAt = null    │
│ (reason: "lwt")             │ (device disconnected abnormally)     │
├─────────────────────────────┼──────────────────────────────────────┤
│ gateway/{gwId}/status       │ Heartbeat: update Gateway.lastSeenAt │
│ (type: "heartbeat")         │ (same 90s window)                    │
└─────────────────────────────┴──────────────────────────────────────┘
```

## WebSocket Events (Socket.IO /device Namespace)

**Client → Server:** `subscribeToDevice/{id}`, `subscribeToFarm/{id}`, `sendCommand(deviceId, command, params)` → joins room, broadcasts to device/farm rooms, or publishes MQTT command respectively.

**Server → Client (broadcasts to device + farm rooms):** `deviceData` (telemetry), `deviceStatus` (battery/signal), `deviceAlert` (threshold breach, < 200ms latency), `deviceProvisioned`, `devicePaired`.

## Authentication Flow

JWT dual-token strategy: short-lived `accessToken` (60m) via Bearer header, long-lived `refreshToken` (30d) via httpOnly cookie. Passwords hashed with bcryptjs (7 salt rounds). Token invalidation via `user.tokenVersion` increment on password change. Password reset flow: OTP email → verify OTP → reset password endpoint.

## MQTT Device/Gateway Authentication (EMQX Integration)

Device provisioning uses pairing token (username field), post-pairing uses device token (generated on pair). Gateway provisioning identical with gateway pairing token. EMQX auth webhook validates token expiry and device/gateway status (disabled = deny). ACL webhook enforces device topic isolation (`device/{id}/*`), gateway multi-device access (`device/+/*`, `provision/resp/+`, `gateway/{gwId}/ota`, `gateway/{gwId}/device-ota`), and JWT-authenticated user farm access (`farm/{ownFarmId}/*`).

---

**Document Version:** 1.6
**Last Updated:** 2026-03-20
**Architecture Pattern:** NestJS 8 with MQTT + WebSocket dual transport + FCM push notifications + Farm-level subscriptions + Zone hierarchy + Config inheritance + Coffee price intelligence + Pump session tracking
