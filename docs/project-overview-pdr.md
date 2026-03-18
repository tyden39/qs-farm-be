# Project Overview & Product Development Requirements

## Project Vision

The IoT Farm Management Platform enables agricultural operators to manage IoT devices across distributed farms with unified real-time monitoring, automated intelligent alerts, and scheduled device control. The system bridges IoT devices (via MQTT) and web/mobile clients (via WebSocket) to provide a seamless farm management experience.

**Core Mission:** Enable data-driven farm management through real-time sensor insights, automated threshold responses, and intelligent scheduling.

## Target Users

### Farm Operators
- Monitor sensor readings across multiple devices in real-time
- Receive alerts when thresholds are breached
- View historical sensor trends and reports
- Execute on-demand device commands
- Schedule recurring or one-time device operations

### System Administrators
- Manage user accounts and farm assignments
- Configure IoT devices and sensor settings
- Define alert thresholds and actions
- Monitor system health and performance
- Generate compliance reports

### IoT Devices
- Register and provision with the platform via MQTT
- Publish telemetry data (sensor readings)
- Receive and execute commands
- Report status and responses
- Support for solar/battery-powered remote devices

## Core Features

### 1. User & Farm Management
**Functional Requirements:**
- User registration, authentication, password reset via email OTP
- Dual-token JWT strategy (short-lived access + long-lived refresh)
- Farm creation and multi-user assignment
- Role-based access control (farm scoping, admin privilege)
- User profile management with avatar upload support
- Token revocation on password change

**Non-Functional Requirements:**
- Password hashing with bcryptjs (7 salt rounds)
- JWT validation on every request
- CORS configured for localhost development
- Refresh token HTTP-only cookie for security

### 2. Device Management & Provisioning
**Functional Requirements:**
- Device registration with unique serial/IMEI
- Automatic device provisioning via MQTT `provision/new` topic
- Pairing token generation (24-hour expiry)
- Device status tracking (PENDING → PAIRED → ACTIVE → DISABLED)
- Device token regeneration and unpair operations
- Device-to-farm association
- Bulk device list per farm

**Non-Functional Requirements:**
- All device operations validate farm scoping
- Disabled devices denied all MQTT and REST access
- Device tokens auto-refreshed before expiry
- Provisioning tokens one-time use only

### 3. Real-time Sensor Monitoring
**Functional Requirements:**
- Multi-sensor type support (pressure, flow, temperature, moisture, current)
- Real-time telemetry ingestion from MQTT `device/{id}/telemetry` topic
- Sensor configuration per device (enable/disable, mode selection)
- Time-series sensor data storage with 1-second precision
- Bulk insert optimization for high-frequency readings
- Device-level sensor comparison and analytics
- Farm-level dashboard with latest readings across all devices

**Non-Functional Requirements:**
- Telemetry ingestion < 100ms latency
- Sensor config cache with 60-second TTL
- Time-series data indexed on (deviceId, createdAt)
- Support 1000+ readings per minute per device

### 4. Threshold Alerts & Automation
**Functional Requirements:**
- Threshold configuration per sensor (WARNING and CRITICAL levels)
- MIN/MAX threshold types with configurable actions
- Automatic threshold evaluation in AUTO mode
- Alert generation and persistence in alert log
- Two-level alert priority (WARNING < CRITICAL)
- Anti-spam mechanism (30-second cooldown per sensor)
- User acknowledgment of alerts
- Alert history with direction tracking (above/below)

**Non-Functional Requirements:**
- CRITICAL thresholds evaluated before WARNING
- Alert evaluation < 500ms end-to-end
- In-memory state machine for anti-spam
- Alert logs indexed on (deviceId, createdAt)
- All alerts persisted regardless of action

### 5. Device Command Scheduling
**Functional Requirements:**
- Recurring schedule support (weekday + time-based execution)
- One-time schedule support (executeAt timestamp)
- Farm-wide or single-device targeting (mutually exclusive)
- Timezone-aware schedule evaluation
- Automatic disabling after one-time execution
- Catch-up on restart for missed executions
- Schedule history and execution logging
- Command parameter JSON support

**Non-Functional Requirements:**
- Schedule evaluation every 60 seconds
- Timezone conversion via Intl.DateTimeFormat (no external lib)
- Execution guard against overlapping ticks
- Support up to 1000 active schedules

### 6. MQTT Device Communication
**Functional Requirements:**
- MQTT broker integration (EMQX 5.4+)
- Topic hierarchy: `device/{id}/cmd`, `/status`, `/telemetry`, `/resp`, `provision/*`
- Publish-Subscribe pattern for device commands and responses
- Device authentication via token in MQTT username
- Automatic topic ACL based on device status and farm scoping
- Support for device-to-platform responses

**Non-Functional Requirements:**
- MQTT connection resilience and auto-reconnect
- Support QoS 1 (at least once) for critical commands
- Broker webhook auth/ACL validation < 200ms
- Support 500+ concurrent device connections

### 7. WebSocket Real-time Gateway
**Functional Requirements:**
- Socket.IO namespace `/device` for client connections
- JWT authentication on handshake
- Subscribe/unsubscribe to device rooms (`device:{id}`)
- Receive device telemetry updates in real-time
- Send on-demand device commands via Socket.IO
- Broadcast device status changes and alerts
- Support multiple concurrent connections per user

**Non-Functional Requirements:**
- WebSocket latency < 1 second for telemetry
- Support 10,000+ concurrent WebSocket connections
- Automatic disconnection on JWT expiry
- Graceful fallback if WebSocket unavailable

### 8. Reports & Analytics
**Functional Requirements:**
- Device-level statistics (min, max, avg per sensor)
- Time-series data aggregation (hourly, daily, weekly, monthly)
- Device sensor comparison across farm
- Farm dashboard with device overview
- Alert summary (by level, device, sensor)
- Command execution history with success/failure tracking
- System-wide overview (devices by status, alerts by level)

**Non-Functional Requirements:**
- Report generation < 5 seconds
- Support 1-year historical data queries
- Aggregation via PostgreSQL DATE_TRUNC
- Pagination support for large result sets

### 9. Command Logging & Audit Trail
**Functional Requirements:**
- Log all commands (manual + automated)
- Capture command source (MANUAL from REST/WebSocket, AUTOMATED from thresholds)
- Record success/failure status and error details
- Track associated sensor thresholds (for automated)
- Support bulk query by device, date, status
- Export command history for compliance

**Non-Functional Requirements:**
- Command logging < 50ms
- Indexed on (deviceId, createdAt)
- JSONB parameter storage for flexibility
- Support retention policies

## Non-Functional Requirements (Cross-Module)

### Performance
- REST API response time: < 500ms (p95)
- Real-time telemetry end-to-end: < 1 second
- Database query optimization for time-series data
- Caching strategy for config data (60s TTL)

### Scalability
- Support 1000+ IoT devices per farm
- Support 100+ concurrent users
- Support 1000+ commands per minute
- Support 10,000+ WebSocket connections
- PostgreSQL replication for HA

### Security
- JWT validation on all protected endpoints
- MQTT device token validation via EMQX webhook
- Topic ACL enforcement (device isolation, farm scoping)
- Password hashing with bcryptjs
- Input validation via class-validator DTOs
- SQL injection prevention via TypeORM parameterization
- CORS configuration for production domains

### Reliability
- Database transaction support for critical operations
- Idempotent command scheduling (no duplicate execution)
- Automatic reconnection to MQTT broker
- Health checks for all external services (DB, MQTT, Redis if added)
- Graceful error handling with user-friendly messages

### Observability
- Request logging with request ID
- Error tracking and alerting
- Performance metrics (response times, error rates)
- MQTT broker connection state monitoring
- Database query performance tracking

### Data Integrity
- Unique constraints on device serial/IMEI
- Foreign key cascade for entity deletions
- Transactional updates for critical state changes
- Audit logging of user actions

## Technical Architecture

### Dual Transport Model
- **MQTT** for IoT devices (low-bandwidth, reliable for battery devices)
- **WebSocket** for web/mobile clients (real-time push, lower latency)
- **SyncService** bridges MQTT → WebSocket for client visibility

### Event-Driven Architecture
- MQTT events trigger Domain Events via @nestjs/event-emitter
- Decoupled processing (SensorService listens for telemetry events)
- Command logging via @OnEvent decorators

### Data Model Highlights
- UUID primary keys (except SensorData which uses bigint for time-series)
- Separate tables for config/threshold/data (not merged) for flexibility
- Unique constraints on sensor config (deviceId, sensorType)
- JSONB columns for dynamic command parameters

### Module Dependency Chain
```
AppModule
└── AuthModule → UserModule → FarmModule → DeviceModule
    ├── MqttService (MQTT client)
    ├── SyncService (MQTT→WS bridge, event emitter)
    └── SensorModule → ThresholdService
```

## Success Metrics

### User Engagement
- Daily active users (operators on the platform)
- Average session duration
- Feature adoption rate (scheduling, thresholds)

### System Performance
- API response time (target: < 500ms p95)
- Real-time telemetry latency (target: < 1s)
- Alert detection latency (target: < 2s)
- WebSocket connection success rate (target: > 99%)

### Device Reliability
- Percentage of devices actively reporting
- MQTT connection uptime (target: > 99.5%)
- Command success rate (target: > 99%)

### Data Quality
- Sensor reading completeness (target: > 95%)
- Data accuracy (validated against device specs)
- Alert accuracy (false positive rate < 5%)

## Dependencies & Constraints

### External Services
- PostgreSQL 14+ (database)
- EMQX 5.4+ (MQTT broker)
- Node.js 18+ (runtime)

### NestJS Ecosystem
- @nestjs/core 8.x
- @nestjs/jwt 8.x
- @nestjs/passport 8.x
- @nestjs/event-emitter 1.4.2 (v1.x for NestJS 8 compatibility)
- @nestjs/schedule 1.1.0 (v1.x for NestJS 8 compatibility)
- TypeORM 0.2.41

### Known Constraints
- NestJS 8 (no v9/v10 features)
- PostgreSQL only (no multi-DB support)
- Single-region deployment (no geo-distributed sync)
- No built-in multi-tenancy (farm-level scoping only)

## Development Phases

### Phase 1 (Complete)
- Core infrastructure: Auth, User, Farm, Files modules
- JWT authentication framework
- User registration, password reset, token refresh
- Farm CRUD and user-farm association

### Phase 2 (Complete)
- IoT integration: Device, MQTT, EMQX, Provision modules
- Real-time telemetry: SyncService, DeviceGateway
- Sensor monitoring: SensorService, thresholds, alerts
- Device scheduling: ScheduleModule with cron-like support

### Phase 3 (Planned)
- Production hardening: DB migrations, monitoring, rate limiting
- Performance optimization: indexing, caching, query optimization
- Security hardening: audit logging, secret rotation

### Phase 4 (In Progress - Advanced Features)
- ✅ **FCM push notifications** (delivered 2026-03-03)
- ✅ **Farm-level WebSocket subscriptions** (delivered 2026-03-11)
- ✅ **Coffee price market intelligence** (delivered 2026-03-12, schedule updated 2026-03-17)
- ✅ **Pump session tracking & Excel export** (delivered 2026-03-16)
- ✅ **Firmware OTA management** (delivered 2026-03-16)
- Email/SMS notifications (planned)
- Analytics dashboards (planned)
- Mobile app integration: iOS/Android SDKs (planned)

### Phase 5 (Planned)
- Scale & optimize: horizontal scaling, message queue (RabbitMQ)
- Advanced analytics: ML-based anomaly detection
- Enterprise features: multi-tenancy, SSO, SAML

## Acceptance Criteria

### Core Functionality
- [x] Devices can provision via MQTT and pair with farms
- [x] Sensor telemetry flows end-to-end (MQTT → DB → WebSocket)
- [x] Thresholds trigger alerts and automated commands
- [x] Schedules execute at correct times with timezone support
- [x] All API endpoints documented in Swagger
- [x] Pump sessions tracked with lifecycle events (v1.4)
- [x] Firmware OTA deployment supported (v1.4)
- [x] FCM push notifications for alerts and schedules (v1.1+)
- [x] Coffee price intelligence with daily scraping (v1.3)

### Performance
- [x] API response time < 500ms (p95)
- [x] Telemetry latency < 1 second (MQTT to client)
- [x] Support 1000+ devices per farm
- [x] Support 100+ concurrent users
- [x] Support 10,000+ WebSocket connections (with farm-level rooms)

### Security
- [x] All protected endpoints require valid JWT
- [x] MQTT devices authenticated via token
- [x] Farm scoping enforced (users see only their farms)
- [x] Passwords hashed with bcryptjs
- [x] FCM tokens managed securely per user/platform

### Testing
- [ ] Unit test coverage > 70%
- [ ] E2E tests for critical flows
- [ ] Load tests for performance validation
- [ ] Security tests for injection attacks

### Documentation
- [x] API documentation complete (Swagger)
- [x] Architecture documentation (this file + system-architecture.md)
- [x] Code standards documented
- [x] Deployment guide with troubleshooting
- [x] Test guide for pump session tracking (v1.4)

---

**Document Version:** 1.1
**Last Updated:** 2026-03-18
**Status:** Phase 2 Complete + Advanced Features (Phase 4) Underway
**Current Release:** v1.4.1 (2026-03-17)
