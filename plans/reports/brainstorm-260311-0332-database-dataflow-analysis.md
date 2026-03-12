# Database Design & Data Flow Analysis - QS Farm

**Date:** 2026-03-11
**Focus:** Database schema, entity relationships, data flow patterns, issues & recommendations

---

## 1. Entity Inventory (15 entities)

| # | Entity | PK Type | Module | Purpose | Growth Rate |
|---|--------|---------|--------|---------|-------------|
| 1 | User | UUID | auth | Account info | Low |
| 2 | ResetToken | UUID | auth | Password reset OTP | Low (transient) |
| 3 | Farm | UUID | farm | Farm grouping | Low |
| 4 | Device | UUID | device | IoT device record | Low-Medium |
| 5 | PairingToken | UUID | provision | One-time pairing token | Low (transient) |
| 6 | SensorConfig | UUID | sensor | Sensor settings per device | Low |
| 7 | SensorThreshold | UUID | sensor | Alert rules per config | Low |
| 8 | **SensorData** | **bigint** | sensor | **Time-series readings** | **VERY HIGH** |
| 9 | AlertLog | UUID | sensor | Threshold breach history | Medium-High |
| 10 | CommandLog | UUID | sensor | Command audit trail | Medium |
| 11 | DeviceSchedule | UUID | schedule | Recurring/one-time jobs | Low |
| 12 | Firmware | UUID | firmware | Firmware versions | Low |
| 13 | FirmwareUpdateLog | UUID | firmware | OTA update history | Low-Medium |
| 14 | DeviceToken (FCM) | UUID | notification | Push notification tokens | Low |
| 15 | File | UUID | files | Upload metadata | Low |

---

## 2. Entity Relationship Diagram (Actual)

```
User (UUID)
 ├── 1:M → Farm
 ├── 1:M → ResetToken (no FK constraint!)
 ├── 1:M → DeviceToken(FCM)
 └── 1:M → Firmware (createdBy)

Farm (UUID)
 ├── 1:M → Device
 └── 1:M → DeviceSchedule (optional, XOR with deviceId)

Device (UUID)
 ├── 1:M → SensorConfig
 ├── 1:M → SensorData (no FK relation! only column match)
 ├── 1:M → AlertLog
 ├── 1:M → CommandLog
 ├── 1:M → DeviceSchedule (optional, XOR with farmId)
 └── 1:M → FirmwareUpdateLog

SensorConfig (UUID)
 └── 1:M → SensorThreshold (CASCADE delete)

PairingToken (UUID) ─── standalone, no FK to Device
```

---

## 3. Data Flow Diagrams

### Flow 1: Telemetry Ingestion (Main Flow)

```
IoT Device
    │
    │ MQTT publish: device/{deviceId}/telemetry
    │ payload: { pressure: 4.5, flow: 12.3, temperature: 45, current: 8.2 }
    │
    ▼
MqttService (subscribes device/+/telemetry)
    │
    ▼
SyncService.handleDeviceTelemetry()
    ├──► WebSocket broadcast: deviceData → room device:{deviceId}
    │    (mobile app nhan realtime)
    │
    └──► EventEmitter: 'telemetry.received'
         │
         ▼
    SensorService.processTelemetry()
         │
         ├── 1. Parse payload → map field names to SensorType
         │     pressure → WATER_PRESSURE
         │     flow → WATER_FLOW
         │     temperature → PUMP_TEMPERATURE
         │     soilMoisture → SOIL_MOISTURE
         │     current → ELECTRICAL_CURRENT
         │     phase → ELECTRICAL_PHASE
         │
         ├── 2. Bulk INSERT → SensorData table
         │     (1 row per sensor reading)
         │
         ├── 3. Load SensorConfig (cached 60s TTL, in-memory Map)
         │     includes thresholds via relation
         │
         ├── 4. Lookup device.farmId (DB query EVERY telemetry!)
         │
         └── 5. For each reading where config.mode=AUTO:
              │
              ▼
         ThresholdService.evaluate(deviceId, farmId, config, value)
              │
              ├── Sort thresholds: CRITICAL first, WARNING second
              │
              ├── Check: value < minThreshold? → direction=BELOW
              │   Check: value > maxThreshold? → direction=ABOVE
              │
              ├── Anti-spam check:
              │   ├── State machine: action already active? → SKIP
              │   └── Cooldown: 30s since last action? → SKIP
              │
              ├── If threshold breached AND not spam:
              │   ├── MQTT publish → device/{id}/cmd (action command)
              │   ├── INSERT → CommandLog (source: AUTOMATED)
              │   ├── INSERT → AlertLog
              │   ├── WebSocket broadcast → deviceAlert
              │   └── FCM push → farm owner (fire-and-forget)
              │
              └── If NO violation → clear state machine for this sensor
```

### Flow 2: Manual Command

```
Mobile App
    │
    ├── REST: POST /api/device/{id}/command
    │   OR
    └── WebSocket: sendCommand event
         │
         ▼
    SyncService.sendCommandToDevice(deviceId, command, params)
         │
         ├── MQTT publish → device/{deviceId}/cmd
         ├── WebSocket broadcast → commandSent
         └── EventEmitter: 'command.dispatched'
              │
              ▼
         SensorService.handleCommandDispatched()
              └── INSERT → CommandLog (source: MANUAL)
```

### Flow 3: Schedule Execution

```
@Interval(60_000) ← every 60 seconds
    │
    ▼
ScheduleService.processSchedules()
    │
    ├── Guard: if (executing) return  ← prevent overlap
    │
    ├── SELECT * FROM device_schedule WHERE enabled=true
    │
    └── For each schedule:
         │
         ├── Recurring: check dayOfWeek + time match (timezone-aware)
         ├── One-time: check executeAt <= now && not yet executed
         │
         └── If should execute:
              │
              ├── Single device: sendCommandToDevice(deviceId, cmd, params)
              │   OR
              ├── Farm-wide: SELECT devices by farmId → loop sendCommand
              │
              ├── UPDATE lastExecutedAt
              ├── If one-time: SET enabled=false
              └── FCM push → farm owner
```

### Flow 4: Device Provisioning

```
New IoT Device
    │
    │ MQTT: provision/new { serial, hw, nonce, sig }
    │
    ▼
SyncService → ProvisionService.handleProvisionRequest()
    │
    ├── CREATE Device (status: PENDING)
    ├── CREATE PairingToken (24h expiry)
    ├── MQTT respond: provision/resp/{nonce}
    └── WebSocket broadcast: deviceProvisioned
         │
         │ ... user sees new device on mobile app ...
         │
    Mobile App: POST /api/provision/pair { token, farmId }
         │
         ▼
    ProvisionService.pairDevice()
         ├── Validate PairingToken (not expired, not used)
         ├── UPDATE Device (status: PAIRED, farmId, generate deviceToken)
         ├── UPDATE PairingToken (used: true)
         └── MQTT: device/{id}/cmd { command: 'set_owner' }
```

---

## 4. Database Issues Found

### ISSUE 1: SensorData - No FK to Device (DESIGN)

```typescript
// sensor-data.entity.ts
@Column('uuid')
deviceId: string;  // ← just a column, no @ManyToOne relation
```

**Impact:** Orphan data possible if device deleted. No cascade behavior. However, this is likely intentional for time-series performance (FK adds overhead on high-write tables).

**Verdict:** OK cho performance, nhung can data retention policy de clean orphans.

---

### ISSUE 2: ResetToken - No FK to User (BUG)

```typescript
// reset-token.entity.ts
@Column()
userId: string;  // ← no @ManyToOne, no FK constraint!
```

**Impact:** No cascade delete. If user deleted, orphan ResetTokens remain. No referential integrity enforcement.

**Severity:** Low (transient data, nhung van la bad practice).

---

### ISSUE 3: PairingToken - No FK to Device (DESIGN GAP)

```typescript
// pairing-token.entity.ts - standalone entity
// No relation to Device at all, only shares `serial` field
```

**Impact:** Cannot trace which PairingToken created which Device easily. Query requires JOIN on serial.

---

### ISSUE 4: Device.farmId nullable - Orphan risk (DESIGN)

```typescript
@Column('uuid', { nullable: true })
farmId: string;
```

**Impact:** Device can exist without Farm (PENDING state). But after pairing, if Farm deleted → device.farmId dangles (no CASCADE defined on ManyToOne).

**Check needed:** Is `onDelete` behavior defined?
```typescript
@ManyToOne(() => Farm, (farm) => farm.devices)
// NO onDelete specified! Default = no action
```

**Severity:** Medium. Farm delete → devices become orphans with stale farmId.

---

### ISSUE 5: SensorData growth - No retention strategy (CRITICAL)

```
Scenario: 10 devices × 6 sensors × 1 reading/30s = 120 rows/minute = 172,800/day
After 1 year: ~63 million rows
```

**Current state:** No partition, no archival, no cleanup. Table will grow unbounded.

**Indexes exist:** `[deviceId, createdAt]` and `[deviceId, sensorType, createdAt]` - OK for queries but INSERT performance degrades as table grows.

---

### ISSUE 6: AlertLog - No index on deviceId+createdAt (PERFORMANCE)

```typescript
// alert-log.entity.ts - no @Index decorator!
```

**All query patterns:**
- `WHERE al.deviceId = :deviceId ORDER BY al.createdAt DESC`
- `INNER JOIN Device WHERE d.farmId = :farmId`

**Impact:** Full table scan on AlertLog as data grows. SensorData and CommandLog have proper composite indexes, but AlertLog does not.

**Severity:** Medium-High. Will hit performance issues with moderate data.

---

### ISSUE 7: SensorConfig unique constraint mismatch

```typescript
@Unique(['deviceId', 'sensorType'])
```

**But:** SensorThreshold unique is:
```typescript
@Unique(['sensorConfigId', 'level'])
```

**Issue:** This allows only 1 threshold per level (WARNING/CRITICAL) per config. BUT both minThreshold and maxThreshold are on the same row. So you can't have separate WARNING for min and WARNING for max - they share the same row.

**Question:** Is this intentional? It means:
- 1 SensorConfig per (device, sensorType)
- Max 2 SensorThresholds per config (1 WARNING + 1 CRITICAL)
- Each threshold has both min AND max on same row

```
Device → WATER_PRESSURE config → WARNING threshold (min=2, max=8)
                                → CRITICAL threshold (min=1, max=10)
```

This is **reasonable for simple use cases** but limiting if you need different actions for min vs max violations (e.g., turn ON pump when pressure LOW, turn OFF pump when pressure HIGH).

---

### ISSUE 8: CommandLog.sensorType is varchar, not enum (INCONSISTENCY)

```typescript
// command-log.entity.ts
@Column({ type: 'varchar', nullable: true })
sensorType: string;  // ← varchar

// alert-log.entity.ts
@Column({ type: 'enum', enum: SensorType })
sensorType: SensorType;  // ← enum
```

**Impact:** Inconsistent data types. CommandLog allows arbitrary string, AlertLog enforces enum. Data integrity gap.

---

### ISSUE 9: DeviceSchedule XOR constraint not enforced at DB level

```typescript
@Column('uuid', { nullable: true })
deviceId: string;

@Column('uuid', { nullable: true })
farmId: string;
```

**Only validated in code:**
```typescript
if (hasDevice === hasFarm) throw BadRequestException(...)
```

**Impact:** DB allows both null, or both set. Application-level validation only - data can be corrupted via direct DB access or bugs.

---

### ISSUE 10: processTelemetry queries device EVERY time (PERFORMANCE)

```typescript
// sensor.service.ts line 99
const device = await this.deviceRepo.findOne(deviceId);
const farmId = device?.farmId;
```

**Impact:** Every telemetry event does an extra DB query just to get `farmId`. At 120 readings/minute, that's 120 unnecessary queries/minute.

**Fix:** Cache deviceId→farmId mapping (same pattern as config cache), or include farmId in telemetry event from SyncService.

---

### ISSUE 11: Anti-spam state in-memory only (RELIABILITY)

```typescript
// threshold.service.ts
private deviceStates: Map<string, Map<string, boolean>> = new Map();
private lastActionTime: Map<string, number> = new Map();
```

**Impact:** Server restart → all anti-spam state lost → immediate flood of duplicate commands. No shared state across multiple instances (future scaling).

---

### ISSUE 12: Farm dashboard N+1 query (PERFORMANCE)

```typescript
async getFarmDashboard(farmId: string) {
  const devices = await this.deviceRepo.find({ where: { farmId } });
  const result = await Promise.all(
    devices.map(async (device) => {
      const latestReadings = await this.findLatestSensorData(device.id);
      // 1 query per device!
      ...
    }),
  );
}
```

**Impact:** 10 devices = 11 queries (1 for devices + 10 for latest readings). Scale to 50 devices = 51 queries.

**Fix:** Single query with DISTINCT ON + JOIN.

---

## 5. Data Flow Issues

### FLOW ISSUE 1: Command logging split across 2 services

```
Manual commands:   SyncService emits event → SensorService logs (via @OnEvent)
Automated commands: ThresholdService logs directly (no event)
```

**Problem:** Inconsistent logging path. If SensorService down, manual commands not logged. Automated always logged (synchronous). Two different code paths for same table.

---

### FLOW ISSUE 2: Telemetry broadcast BEFORE storage

```
SyncService.handleDeviceTelemetry():
  1. broadcastDeviceData()    ← WebSocket first
  2. eventEmitter.emit()      ← then store via SensorService
```

**Problem:** Client sees data before DB confirms storage. If DB insert fails, client shows phantom data that doesn't exist in DB.

---

### FLOW ISSUE 3: Schedule execution has no failure tracking

```typescript
// schedule.service.ts execute()
} catch (error) {
  this.logger.error(...);
  return;  // ← silently fails, no record
}

schedule.lastExecutedAt = now;  // ← only set on success
```

**Problem:** Failed schedule execution not recorded anywhere except logs. No way to query "which schedules failed last week?" via API.

---

### FLOW ISSUE 4: FCM notification tight coupling

```
ThresholdService → FcmService.sendToFarmOwner()
ScheduleService → FcmService.sendToFarmOwner()
```

**Both services** directly call FcmService. If more notification channels added (email, SMS, in-app), every call site needs updating. Should use an event/notification service pattern.

---

## 6. Schema Quality Summary

| Aspect | Score | Notes |
|--------|-------|-------|
| Entity naming | 8/10 | Consistent, clear, kebab-case files |
| Relationships | 5/10 | Missing FKs (ResetToken, SensorData), missing cascades |
| Indexes | 6/10 | SensorData good, AlertLog missing, CommandLog good |
| Data types | 7/10 | Mostly correct, CommandLog.sensorType inconsistency |
| Constraints | 5/10 | XOR not at DB level, some missing unique constraints |
| Time-series design | 6/10 | bigint PK good, but no partitioning or retention |
| Normalization | 8/10 | Clean separation (config/threshold/data/alert) |
| Enum usage | 7/10 | Good use of PG enums, but some varchar where enum should be |
| Scalability readiness | 4/10 | No partitioning, no archival, in-memory state, N+1 queries |
| Overall | 6.2/10 | Solid foundation, needs fixes before production |

---

## 7. Priority Fix List

### Must Fix (Before Production)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | AlertLog missing index `[deviceId, createdAt]` | 5 min | High - query performance |
| 2 | SensorData retention policy (partition or cleanup) | 1-2 days | Critical - disk space |
| 3 | Cache deviceId→farmId in processTelemetry | 30 min | Medium - 120 queries/min saved |
| 4 | Farm→Device cascade behavior (onDelete) | 30 min | Medium - orphan prevention |
| 5 | ResetToken add FK to User | 15 min | Low - data integrity |
| 6 | CommandLog.sensorType: varchar → enum | 15 min | Low - consistency |

### Should Fix (Soon)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 7 | Farm dashboard N+1 → single query | 1-2 hours | Medium - performance |
| 8 | Anti-spam state persistence (Redis or DB) | 2-4 hours | Medium - reliability |
| 9 | Telemetry broadcast order (store first) | 30 min | Low-Medium - data consistency |
| 10 | Schedule execution failure tracking | 1-2 hours | Medium - observability |
| 11 | Unified notification dispatch (event-based) | 2-4 hours | Medium - maintainability |

### Nice to Have (Later)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 12 | DeviceSchedule XOR constraint at DB level | 1 hour | Low - defense in depth |
| 13 | SensorThreshold: separate min/max actions | 2-4 hours | Medium - flexibility |
| 14 | PostgreSQL table partitioning for SensorData | 1-2 days | High - scalability |
| 15 | DB migrations (replace synchronize:true) | 2-3 days | Critical - production safety |

---

## 8. Unresolved Questions

1. SensorData khong co FK la intentional (performance) hay bi quen?
2. Threshold chia se min+max tren cung 1 row - co can tach ra de co actions khac nhau cho min vs max khong?
3. Anti-spam state - co plan chuyen sang Redis khong? Hay chap nhan mat state khi restart?
4. Farm delete behavior mong muon la gi? CASCADE xoa devices? Hay block delete neu con device?
5. Schedule fail co can retry mechanism khong? Hay chi log va skip?

---

**Next step:** Chon issues nao can fix truoc, toi se tao implementation plan.
