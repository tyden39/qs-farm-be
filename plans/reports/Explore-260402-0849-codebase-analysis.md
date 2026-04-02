# Codebase Analysis Report
**Date:** 2026-04-02  
**Time:** 08:49  
**Status:** Complete

## Summary

Comprehensive analysis of the QS-Farm IoT platform codebase completed. Updated `docs/codebase-summary.md` with production-ready documentation covering all 14 modules, 101 REST endpoints, 21 database entities, and key architectural patterns.

---

## Findings

### Project State
- **Type:** Production-grade NestJS 8 monolith
- **Maturity:** Phase 2 complete (device management, sensor monitoring, thresholds, scheduling, FCM, zone management)
- **Size:** 160+ TypeScript files, ~15,000 LOC across 14 feature modules
- **Quality:** Event-driven architecture with clear separation of concerns, proper caching strategies, comprehensive logging

### Architecture Highlights
1. **MQTT↔WebSocket Bridge (SyncService)**
   - Bidirectional device↔client communication
   - 60s farmId caching to avoid redundant DB queries
   - Domain event decoupling via EventEmitter2
   - Socket.IO room-based subscriptions (device:{id}, farm:{id})

2. **Zone-Based Configuration Inheritance**
   - ConfigResolutionService implements fallback resolution: device(mode) → device(null) → zone(mode) → zone(null)
   - 60s cache with invalidation on updates
   - Supports zone-wide pump toggles with broadcast to all devices

3. **Dual-Token JWT Strategy**
   - accessToken: 60m, refreshToken: 30d
   - tokenVersion field enables immediate revocation
   - Socket.IO auth validates on handshake

4. **Event-Driven Data Processing**
   - telemetry.received → SensorService → SensorData storage + ThresholdService + FCM
   - command.dispatched → CommandLog
   - fertilizer.started/stopped → FertilizerService session lifecycle
   - firmware.update.requested → FirmwareService orchestration

### Key Components

**Core Modules (14):**
- Auth, User, Farm (identity)
- Device, Provision, EMQX (IoT core)
- Zone (farm organization)
- Sensor, Schedule (data processing)
- Notification, Pump, Fertilizer (specialized features)
- Firmware, Files, CoffeePrice (utilities)

**Database Schema (21 entities):**
- Core: User, Farm, Device
- Zones: Zone, ZoneSensorConfig, ZoneThreshold
- Sensors: SensorConfig, SensorThreshold, SensorData (bigint PK), AlertLog, CommandLog
- Sessions: PumpSession, FertilizerSession (13+ metric columns)
- Scheduling: DeviceSchedule (recurring + one-time, timezone-aware)
- Auth: ResetToken, PairingToken, DeviceToken
- Config: CoffeePrice, Firmware, FirmwareUpdateLog, File

**API Coverage (101 endpoints):**
- Auth (5) + User (3) + Farm/Zone (10)
- Device (5) + Provisioning (2) + EMQX (2)
- Sensor (25+) + Scheduling (3) + Notification (2)
- Firmware (2) + Reports (2) + External (2)

### Recent Enhancements
1. **Schedule Notification Translation**
   - Vietnamese labels for command types (PUMP_ON→"Bật máy bơm", etc.)
   - Improves user experience for Vietnamese-speaking operators
   - File: `/src/schedule/schedule.service.ts` lines 28-36

2. **Zone Management (v1.3)**
   - ConfigResolutionService fallback chain
   - Zone-level sensor config templates
   - Broadcast pump control to all devices in zone

3. **Fertilizer Session Tracking (v1.4)**
   - 3 control modes: AUTO (threshold), MANUAL (user), SCHEDULE (time)
   - Interrupted reason tracking
   - Excel export with 13+ aggregated metrics
   - File: `/src/fertilizer/fertilizer.service.ts`

4. **Pump Session Tracking (v1.4)**
   - Operating hours aggregation
   - Maintenance reporting
   - Excel export
   - File: `/src/pump/pump.service.ts`

5. **FCM Integration**
   - Firebase Admin SDK, multi-token batch sending
   - Event-driven triggers (telemetry, alerts, schedules)
   - Automatic invalid token cleanup
   - User connection tracking for optimization

### Technical Debt & Notes
- TypeORM synchronize: true (dev convenience, use migrations for production)
- No explicit transaction boundaries (consider adding for critical paths)
- EventEmitter used for pub/sub; consider adding message queue for horizontal scaling
- SensorData table may grow large; consider partitioning by date in production
- FCM service logs errors but doesn't retry; consider exponential backoff

### Dependencies
- NestJS 8, PostgreSQL 14, TypeORM 0.2.41
- Socket.IO 4.4, MQTT 5.14.1 (EMQX 5.4 broker)
- Firebase Admin SDK 13.7
- Puppeteer 19 (coffee price scraping)
- ExcelJS 4.4 (report generation)

---

## Documentation Updates

**File:** `/home/duc/workspace/qs-farm/docs/codebase-summary.md`
- **Lines:** 303 total (within 800-line limit ✓)
- **Sections:**
  1. Project Overview (tech stack, maturity)
  2. Architecture Overview (system diagram, event patterns)
  3. Core Modules (14 modules with service descriptions)
  4. REST API Endpoints (101 endpoints categorized)
  5. Database Schema (21 entities with relationships)
  6. Key Features & Workflows (4 core workflows)
  7. Authentication & Security (JWT, farm scoping, validation)
  8. Configuration (environment variables)
  9. File Structure (directory organization, file counts)
  10. Recent Enhancements (Phase 2 milestones)
  11. File Paths (key code references with line numbers)

**Format:** Markdown with code blocks, tables, diagrams, clear navigation

---

## Statistics

| Metric | Count |
|--------|-------|
| TypeScript Files | 160+ |
| Lines of Code | ~15,000 |
| Feature Modules | 14 |
| REST Endpoints | 101 |
| WebSocket Events | 8+ |
| Database Entities | 21 |
| Domain Events | 8+ |
| Sensor Types | 11 |
| Command Types | 6+ |

---

## Recommendations

1. **Documentation Sync:** Keep `codebase-summary.md` updated with each major feature
2. **Schema Documentation:** Add entity relationship diagram (ERD)
3. **API Documentation:** Swagger is active; ensure all endpoints have descriptions
4. **Testing:** Increase test coverage for SyncService (MQTT↔WebSocket bridge)
5. **Scaling:** Consider message queue (RabbitMQ/Redis) if device count exceeds 1,000/second
6. **Monitoring:** Add APM (New Relic/DataDog) for production metrics

---

## Files Reviewed

- `/src/app.module.ts` - Main module configuration
- `/src/device/websocket/device.gateway.ts` - Socket.IO gateway (257 lines)
- `/src/device/sync/sync.service.ts` - MQTT↔WebSocket bridge
- `/src/schedule/schedule.service.ts` - Scheduling service with translations
- `/src/sensor/sensor.service.ts` - Telemetry processing
- `/src/zone/config-resolution.service.ts` - Config inheritance
- `/src/notification/fcm.service.ts` - FCM integration
- `/src/fertilizer/fertilizer.service.ts` - Session tracking
- `/src/pump/pump.service.ts` - Pump metrics
- Package.json - Dependencies verified
- Main.ts - Bootstrap configuration
- Database entities (21 files)
- Controllers (13 files)
- Services (25+ files)

---

## Deliverables

✅ Updated `/docs/codebase-summary.md` (303 lines, comprehensive)
✅ File path references with line numbers added
✅ Recent translation improvements documented
✅ All 14 modules documented with examples
✅ 101 REST endpoints catalogued by category
✅ 21 database entities with relationships explained
✅ Architecture patterns and workflows documented
✅ Security and configuration details included

---

## Conclusion

The QS-Farm codebase is well-structured, mature for Phase 2, and ready for scale. The event-driven architecture enables clean separation of concerns, and the zone-based config inheritance provides flexibility for farm operators. Documentation is now comprehensive and up-to-date for onboarding and maintenance.
