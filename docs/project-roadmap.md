# Project Roadmap

## Overview

The IoT Farm Management Platform follows a phased development approach, progressing from core infrastructure through IoT integration to production hardening and advanced features. This document tracks project phases, milestones, and planned features.

**Current Status:** Phase 2 Complete - Full IoT integration with device management, sensor monitoring, and scheduling operational.

## Phase 1: Core Infrastructure (Complete - 100%)

### Status: COMPLETE
**Timeline:** Project inception through authentication implementation
**Completion Date:** 2025-12-31

### Milestones Achieved
- ✅ NestJS 8 project setup with TypeORM and PostgreSQL
- ✅ User authentication system (JWT dual-token strategy)
- ✅ User registration, login, password reset flows
- ✅ Farm management (CRUD, user-farm association)
- ✅ File upload service (Multer disk storage)
- ✅ API documentation (Swagger/OpenAPI)
- ✅ Code standards and naming conventions established
- ✅ Docker Compose setup (development environment)

### Key Achievements
- **Authentication:** Secure JWT tokens with token version revocation
- **User Management:** Full registration, login, password reset with OTP
- **Farm Scoping:** Multi-user, multi-farm support with role-based access
- **File Handling:** Avatar uploads and file management
- **API Documentation:** Auto-generated Swagger docs at /api

### Technologies Integrated
- NestJS 8.x with TypeORM 0.2.41
- PostgreSQL 14 for data persistence
- JWT (Passport.js) for authentication
- Multer for file uploads
- Swagger/OpenAPI for documentation

### Success Metrics (Phase 1)
- ✅ User registration success rate: 100%
- ✅ JWT token validation: 100%
- ✅ API endpoint coverage: 8 auth endpoints, 6 user endpoints, 5 farm endpoints
- ✅ Code quality: No critical linting errors

## Phase 2: IoT Integration & Real-time Monitoring (Complete - 100%)

### Status: COMPLETE
**Timeline:** January 2026 through February 2026
**Completion Date:** 2026-02-25

### Milestones Achieved
- ✅ MQTT client integration (EMQX broker connectivity)
- ✅ Device management (registration, status, token lifecycle)
- ✅ Device provisioning flow (MQTT-based pairing)
- ✅ Real-time telemetry ingestion (MQTT → PostgreSQL)
- ✅ Socket.IO WebSocket gateway for client connectivity
- ✅ Sensor configuration and threshold management
- ✅ Automated threshold alert evaluation
- ✅ Device command scheduling (recurring + one-time)
- ✅ Command logging and audit trail
- ✅ EMQX webhook integration (auth + ACL)
- ✅ Event-driven architecture (telemetry → sensor processing)
- ✅ Anti-spam mechanism for alerts (30s cooldown)

### Key Achievements
- **Dual Transport:** MQTT for IoT devices, WebSocket for clients
- **Real-time Telemetry:** < 500ms latency from device to database to client
- **Threshold Automation:** Configurable MIN/MAX thresholds with auto-dispatch
- **Device Scheduling:** Timezone-aware cron-like scheduling (60s interval)
- **Event Decoupling:** @nestjs/event-emitter for loose coupling
- **Command Audit:** All manual and automated commands logged
- **Sensor Analytics:** Time-series data with aggregation queries

### Modules Delivered
- **Device Module:** Device CRUD, MQTT client, WebSocket gateway
- **Sensor Module:** Config, threshold, data, alert management (22+ endpoints)
- **Schedule Module:** Recurring and one-time command scheduling
- **Provision Module:** Device provisioning and pairing flow
- **EMQX Module:** MQTT broker webhook integration
- **SyncService:** MQTT ↔ WebSocket bridge with event emission

### Database Schema (14 Entities)
- User, ResetToken, Farm, Device, PairingToken
- SensorConfig, SensorThreshold, SensorData, AlertLog, CommandLog
- DeviceSchedule, File, and supporting entities

### REST Endpoints Added
- Device: 9 endpoints (CRUD + command + status + token mgmt)
- Sensor: 22+ endpoints (config, threshold, data, stats, analytics, reports)
- Schedule: 6 endpoints (CRUD + toggle)
- Provision: 7 endpoints (pairing, token mgmt, status)
- EMQX: 2 webhook endpoints (auth, ACL)

### WebSocket Events
- `subscribeToDevice`, `unsubscribeFromDevice`, `sendCommand` (client → server)
- `deviceData`, `deviceStatus`, `deviceAlert`, `deviceProvisioned`, `devicePaired` (server → client)

### Success Metrics (Phase 2)
- ✅ MQTT telemetry ingestion: 1000+ readings/min per device
- ✅ Threshold evaluation: < 200ms latency
- ✅ Command execution: < 100ms MQTT publish
- ✅ WebSocket broadcast: < 100ms to subscribers
- ✅ Schedule processing: 60s interval with zero overlap
- ✅ Device support: 500+ concurrent MQTT connections
- ✅ API coverage: 50+ endpoints
- ✅ Entity relationships: Full referential integrity

## Phase 3: Production Hardening (Planned - 0%)

### Status: PLANNED
**Timeline:** March 2026 - April 2026 (estimated)
**Priority:** High

### Planned Features

#### 3.1 Database Migrations
- Implement TypeORM migrations (replace synchronize: true)
- Version control for schema changes
- Rollback support for deployments
- Data migration scripts for upgrades
- Migration status tracking

#### 3.2 Monitoring & Observability
- Request logging with correlation IDs
- Error tracking and alerting (Sentry integration)
- Performance metrics collection
- MQTT broker connection state monitoring
- Database query performance tracking
- WebSocket connection lifecycle logging

#### 3.3 Rate Limiting & Throttling
- API rate limiting (requests per minute)
- Per-user quota enforcement
- Command frequency limiting (prevent abuse)
- WebSocket message throttling
- Configurable limits per endpoint type

#### 3.4 Input Sanitization & Security
- XSS prevention in file uploads
- MQTT payload validation
- SQL injection prevention review
- CORS hardening for production domains
- CSRF protection for state-changing operations

#### 3.5 Data Retention Policies
- SensorData archival (move old data to archive table)
- AlertLog retention (keep 6-12 months)
- CommandLog retention (keep 1-2 years)
- Automatic purging of expired records
- Backup strategy for compliance

#### 3.6 Health Checks & Readiness Probes
- Database connectivity check
- MQTT broker connectivity check
- Redis connection (if added)
- Endpoint for Kubernetes liveness probe
- Endpoint for Kubernetes readiness probe

#### 3.7 Configuration Management
- Environment-specific configs (dev, staging, prod)
- Feature flags for gradual rollout
- Secrets management (avoid hardcoding)
- Config validation on startup
- Hot-reload support for non-critical config

### Success Criteria
- [ ] Zero downtime deployments
- [ ] Automated alerting for production issues
- [ ] Retention policies enforced
- [ ] Rate limiting prevents API abuse
- [ ] Health checks pass for all services

## Phase 4: Advanced Features (Planned - 0%)

### Status: PLANNED
**Timeline:** May 2026 - July 2026 (estimated)
**Priority:** Medium

### Planned Features

#### 4.1 Notification System
- Email alerts on threshold breach
- SMS alerts (Twilio integration)
- In-app notifications with notification center
- Push notifications for mobile app
- User notification preferences/settings
- Notification templates and customization

#### 4.2 Analytics & Dashboards
- Device performance dashboard (uptime, data quality)
- Farm-level analytics (yield, resource usage)
- Alert trends and patterns
- Command effectiveness analysis
- Sensor correlation analysis
- Time-range filtering (daily, weekly, monthly, custom)

#### 4.3 Mobile App Integration
- iOS SDK for device pairing
- Android SDK for device pairing
- Native WebSocket client library
- Offline data sync when reconnected
- Deep linking support
- App-to-API authentication flow

#### 4.4 Reporting Engine
- Scheduled report generation (PDF, CSV)
- Custom report builder
- Report templates (daily, weekly, monthly)
- Email report distribution
- Export capabilities (CSV, Excel, PDF)
- Report archival and download history

#### 4.5 Third-party Integrations
- Weather API integration (OpenWeatherMap)
- Integration with farm planning tools
- Data export to agricultural platforms
- Webhook support for external systems
- Custom API for partners

#### 4.6 Advanced Scheduling
- Machine learning-based recommendations
- Weather-triggered commands (e.g., irrigate if rain expected)
- Cross-device coordination (device sequencing)
- Schedule templates and recurrence patterns
- Conditional execution (if sensor X > Y then execute)

### Success Criteria
- [ ] Email notifications sent < 5 seconds after alert
- [ ] Analytics dashboards load in < 2 seconds
- [ ] Mobile app achieves > 4.5 star rating
- [ ] Report generation < 30 seconds
- [ ] Third-party integrations tested and documented

## Phase 5: Scale & Optimization (Planned - 0%)

### Status: PLANNED
**Timeline:** August 2026 onwards (estimated)
**Priority:** Low

### Planned Features

#### 5.1 Horizontal Scaling
- Multi-instance backend deployment
- Load balancer configuration (NGINX, AWS ELB)
- Session/state management across instances
- Database connection pooling
- Redis for distributed caching
- Message queue for async operations (RabbitMQ, AWS SQS)

#### 5.2 Performance Optimization
- Database query optimization (identify slow queries)
- Caching layer for frequently accessed data
- CDN for static assets
- Compression for API responses
- Batch API endpoints for bulk operations
- GraphQL endpoint as alternative to REST

#### 5.3 Advanced Caching
- Redis for device status cache
- Redis for sensor config cache
- Cache invalidation strategies
- Cache warming on startup
- TTL configuration per data type

#### 5.4 Monitoring at Scale
- Application Performance Monitoring (APM)
- Log aggregation (ELK, Datadog, New Relic)
- Metrics collection (Prometheus, InfluxDB)
- Distributed tracing (Jaeger)
- Real-time dashboards
- Alert routing and escalation

#### 5.5 Multi-region Deployment
- Replication across geographic regions
- Data consistency strategies
- Failover mechanisms
- Region-specific device management
- Latency optimization per region

#### 5.6 Machine Learning Features
- Anomaly detection in sensor data
- Predictive alerts (predict failures before they happen)
- Optimal scheduling recommendations
- Device performance prediction
- Sensor drift detection

### Success Criteria
- [ ] System supports 10,000+ concurrent users
- [ ] System supports 50,000+ IoT devices
- [ ] API p99 latency < 1 second under load
- [ ] Zero data loss during region failure
- [ ] ML models achieve > 85% prediction accuracy

## Feature Dependency Graph

```
Phase 1: Core Infrastructure
│
├─ User Auth ✅
├─ Farm Management ✅
├─ File Upload ✅
└─ API Documentation ✅
   │
   └─→ Phase 2: IoT Integration
       │
       ├─ MQTT Client ✅
       ├─ Device Management ✅
       ├─ Device Provisioning ✅
       ├─ Real-time Telemetry ✅
       ├─ WebSocket Gateway ✅
       ├─ Sensor Monitoring ✅
       ├─ Threshold Alerts ✅
       ├─ Command Scheduling ✅
       ├─ Command Logging ✅
       └─ EMQX Integration ✅
          │
          └─→ Phase 3: Production Hardening
              │
              ├─ Database Migrations
              ├─ Monitoring & Observability
              ├─ Rate Limiting
              ├─ Security Hardening
              ├─ Data Retention
              └─ Health Checks
                 │
                 └─→ Phase 4: Advanced Features
                     │
                     ├─ Notifications (email, SMS, push)
                     ├─ Analytics & Dashboards
                     ├─ Mobile App Integration
                     ├─ Reporting Engine
                     ├─ Third-party Integrations
                     └─ Advanced Scheduling
                        │
                        └─→ Phase 5: Scale & Optimization
                            │
                            ├─ Horizontal Scaling
                            ├─ Performance Optimization
                            ├─ Advanced Caching
                            ├─ Monitoring at Scale
                            ├─ Multi-region Deployment
                            └─ Machine Learning Features
```

## Release Timeline & Milestones

| Phase | Start | End | Status | Key Deliverable |
|-------|-------|-----|--------|-----------------|
| Phase 1 | 2025-01 | 2025-12 | Complete | Auth + Farm + Files |
| Phase 2 | 2026-01 | 2026-02-25 | Complete | MQTT + Sensors + Schedule |
| Phase 3 | 2026-03 | 2026-04 | Planned | Production Ready |
| Phase 4 | 2026-05 | 2026-07 | Planned | Advanced Features |
| Phase 5 | 2026-08 | TBD | Planned | Enterprise Scale |

## Known Constraints & Risks

### Constraints
- **NestJS 8:** No v9/v10 features available; requires major upgrade for newer capabilities
- **PostgreSQL only:** No multi-database support; scaling strategy limited to vertical scaling
- **Single MQTT broker:** No broker clustering; single point of failure
- **In-memory caching:** No distributed cache; restart loses state
- **Synchronize mode:** DB schema auto-sync; migrations not version-controlled

### Risk Mitigation
- Phase 1 architectural decisions (NestJS 8, TypeORM 0.2.41) well-understood
- Phase 3 migrations planned before production deployment
- Phase 5 addresses scale concerns with horizontal scaling

### Technical Debt
- Config synchronize mode should be replaced with migrations
- In-memory caching should migrate to Redis
- Consider TypeORM 0.3+ in future major version
- EMQX webhook auth could be optimized with token caching

## Success Metrics Overview

### Operational Metrics
- **Uptime:** Target 99.9% (9.2 hours/month downtime)
- **API Response Time:** Target < 500ms (p95)
- **Telemetry Latency:** Target < 1 second (device to client)
- **Command Execution:** Target < 100ms (API to MQTT publish)

### User Metrics
- **Daily Active Devices:** Track growth in active IoT devices
- **Monthly Active Users:** Track farm operator engagement
- **Average Session Duration:** Track user engagement depth
- **Feature Adoption:** % of users using schedules, thresholds, analytics

### Data Quality Metrics
- **Telemetry Completeness:** % of expected readings received
- **Sensor Data Accuracy:** Compared to device specifications
- **Alert Accuracy:** % of legitimate vs. false positive alerts
- **Command Success Rate:** % of commands executed successfully

### Business Metrics
- **Customer Onboarding Time:** Time to first device pairing
- **Farm Operational Efficiency:** Reduction in manual interventions
- **Predictive Value:** Alerts prevented issues before they occurred
- **ROI:** Yield improvements or resource savings

## Communication & Updates

- **Weekly standups:** Development team progress check-ins
- **Bi-weekly demos:** Feature demonstrations to stakeholders
- **Monthly retrospectives:** Lessons learned and process improvements
- **Quarterly roadmap reviews:** Adjust priorities based on feedback

---

**Document Version:** 1.0
**Last Updated:** 2026-02-25
**Phase 1-2 Status:** Complete
**Phase 3-5 Status:** Planned (High confidence in Phase 3 timeline)
