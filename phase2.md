# IoT Sensor Threshold & MQTT Processing — Phase 2

## 1. Overview

This phase extends the existing IoT farm management platform with:

- **Sensor configuration** per device (enable/disable, AUTO/MANUAL mode)
- **Multi-level thresholds** (warning/critical with different actions)
- **Telemetry storage** for historical sensor data
- **Automated command dispatch** when thresholds are exceeded
- **Alert logging** with acknowledgement support
- **Real-time alert broadcasting** to mobile/web via existing WebSocket pipeline

### Existing Stack (unchanged)

- **Backend:** NestJS 8
- **Database:** PostgreSQL + TypeORM (synchronize: true, autoLoadEntities)
- **MQTT Broker:** EMQX (port 1883)
- **WebSocket:** Socket.IO (namespace `/device`)
- **Auth:** JWT (REST + WebSocket), deviceToken (MQTT)

### Current Telemetry Flow (no processing)

```
Device → MQTT (device/{deviceId}/telemetry)
       → MqttService.handleMessage()
       → SyncService.handleDeviceTelemetry()
       → DeviceGateway.broadcastDeviceData()
       → WebSocket clients
```

Currently, telemetry is only forwarded to WebSocket — no storage, no threshold checking. This phase adds processing in the middle of that pipeline.

---

## 2. Sensor Types

### Enum Definition

```typescript
export enum SensorType {
  WATER_PRESSURE = 'water_pressure',
  WATER_FLOW = 'water_flow',
  PUMP_TEMPERATURE = 'pump_temperature',
  SOIL_MOISTURE = 'soil_moisture',
  ELECTRICAL_CURRENT = 'electrical_current',
}
```

### Telemetry Payload Mapping

Device sends JSON payload on `device/{deviceId}/telemetry`:

```json
{
  "soilMoisture": 62,
  "temperature": 65,
  "pressure": 2.5,
  "flow": 10,
  "current": 1.2
}
```

| Payload Field   | SensorType             | Unit  |
|-----------------|------------------------|-------|
| `pressure`      | WATER_PRESSURE         | bar   |
| `flow`          | WATER_FLOW             | L/min |
| `temperature`   | PUMP_TEMPERATURE       | °C    |
| `soilMoisture`  | SOIL_MOISTURE          | %     |
| `current`       | ELECTRICAL_CURRENT     | A     |

Each sensor can be independently configured per device with enabled/disabled state and AUTO/MANUAL mode.

---

## 3. Database Design

### 3.1 Device (existing — no changes)

Uses existing `Device` entity at `src/device/entities/device.entity.ts`. Only addition: a `@OneToMany` relation to `SensorConfig`.

### 3.2 sensor_config (NEW)

Stores per-device sensor configuration.

| Column     | Type                | Notes                                   |
|------------|---------------------|-----------------------------------------|
| id         | uuid PK             | `@PrimaryGeneratedColumn('uuid')`       |
| deviceId   | uuid FK → Device     | `@ManyToOne(() => Device)`              |
| sensorType | enum SensorType      | WATER_PRESSURE, WATER_FLOW, etc.        |
| enabled    | boolean, default true|                                         |
| mode       | enum SensorMode      | AUTO / MANUAL                           |
| unit       | varchar, nullable    | e.g., 'bar', 'L/min', '°C', '%', 'A'   |
| createdAt  | timestamp            | `@CreateDateColumn()`                   |
| updatedAt  | timestamp            | `@UpdateDateColumn()`                   |

- **Unique constraint:** `(deviceId, sensorType)` — one config per sensor per device
- **Relation:** `thresholds: SensorThreshold[]` (`@OneToMany`)

### 3.3 sensor_threshold (NEW)

Stores threshold levels for each sensor config. Supports multiple severity levels per sensor.

| Column         | Type                   | Notes                              |
|----------------|------------------------|------------------------------------|
| id             | uuid PK                |                                    |
| sensorConfigId | uuid FK → SensorConfig | `@ManyToOne(() => SensorConfig)`   |
| level          | enum ThresholdLevel    | WARNING / CRITICAL                 |
| minThreshold   | float, nullable        | null = no lower bound check        |
| maxThreshold   | float, nullable        | null = no upper bound check        |
| action         | varchar                | e.g., 'PUMP_ON', 'SHUTDOWN_PUMP'  |
| createdAt      | timestamp              |                                    |
| updatedAt      | timestamp              |                                    |

- **Unique constraint:** `(sensorConfigId, level)` — one threshold per level per config

**Example data:**

```
SensorConfig: device-1, soil_moisture, enabled=true, mode=AUTO
  └─ Threshold: WARNING,  min=55, max=90, action=PUMP_ON
  └─ Threshold: CRITICAL, min=40, max=95, action=SHUTDOWN_PUMP

SensorConfig: device-1, pump_temperature, enabled=true, mode=AUTO
  └─ Threshold: WARNING,  min=null, max=70, action=ALERT_ONLY
  └─ Threshold: CRITICAL, min=null, max=80, action=SHUTDOWN_PUMP
```

### 3.4 sensor_data (NEW)

High-volume time-series storage for all sensor readings.

| Column     | Type                   | Notes                                        |
|------------|------------------------|----------------------------------------------|
| id         | bigint PK auto-incr    | Exception to UUID: performance for time-series|
| deviceId   | uuid FK → Device       |                                               |
| sensorType | enum SensorType        |                                               |
| value      | double precision       |                                               |
| createdAt  | timestamp, default now | `@CreateDateColumn()`                         |

**Indexes:**
- `(deviceId, createdAt)` — query recent data for a device
- `(deviceId, sensorType, createdAt)` — query specific sensor history

**Note:** bigint auto-increment PK is used instead of UUID because sensor_data is write-heavy and insertion-order matters. UUID randomness hurts B-tree insert performance at scale. Consider PostgreSQL table partitioning by month when data volume grows.

### 3.5 alert_log (NEW)

Records threshold violations and dispatched actions.

| Column       | Type                    | Notes                              |
|--------------|-------------------------|------------------------------------|
| id           | uuid PK                 |                                    |
| deviceId     | uuid FK → Device        |                                    |
| sensorType   | enum SensorType         |                                    |
| value        | float                   | The reading that triggered alert   |
| threshold    | float                   | The threshold that was exceeded    |
| level        | enum ThresholdLevel     | WARNING / CRITICAL                 |
| direction    | enum ('above', 'below') | Whether value was above max or below min |
| action       | varchar, nullable       | Command dispatched (null if ALERT_ONLY)  |
| reason       | varchar                 | e.g., 'OVER_TEMPERATURE'          |
| acknowledged | boolean, default false  | For alert management               |
| createdAt    | timestamp               |                                    |

---

## 4. Processing Flow

### 4.1 Telemetry Pipeline (modified)

The processing integrates into the existing MQTT → WebSocket pipeline via `@nestjs/event-emitter`:

```
Device publishes → device/{deviceId}/telemetry
        ↓
MqttService.handleMessage()              [existing, unchanged]
        ↓
SyncService.handleDeviceTelemetry()      [MODIFIED]
  ├─ Broadcasts to WebSocket             [existing, unchanged]
  └─ Emits 'telemetry.received' event    [NEW]
        ↓
SensorService.processTelemetry()         [NEW, @OnEvent('telemetry.received')]
  ├─ Parse payload → individual sensor readings
  ├─ Bulk-insert into sensor_data
  ├─ Load sensor_config + thresholds (cached)
  └─ For each enabled AUTO sensor → ThresholdService.evaluate()
        ↓
ThresholdService.evaluate()              [NEW]
  ├─ Check value against each threshold level (WARNING, CRITICAL)
  ├─ Anti-spam check (state machine + cooldown)
  ├─ If violation allowed:
  │   ├─ Publish command via MqttService.publishToDevice()
  │   ├─ Insert alert_log record
  │   └─ Broadcast alert via DeviceGateway.broadcastDeviceData()
  └─ Skip if anti-spam blocks
```

### 4.2 Existing Infrastructure Reused

| Component | Location | How It's Used |
|-----------|----------|---------------|
| `MqttService.publishToDevice()` | `src/device/mqtt/mqtt.service.ts:176` | Dispatch commands to `device/{deviceId}/cmd` |
| `DeviceGateway.broadcastDeviceData()` | `src/device/websocket/device.gateway.ts` | Push alerts to WebSocket room `device:{deviceId}` |
| `SyncService.handleDeviceTelemetry()` | `src/device/sync/sync.service.ts:99` | Integration point — add event emission here |

---

## 5. Threshold Logic

### 5.1 Evaluation Flow

For each sensor reading:

```
1. Load SensorConfig for (deviceId, sensorType)
2. If !enabled OR mode != AUTO → skip
3. Load SensorThreshold[] for this config
4. For each threshold (ordered: CRITICAL first, then WARNING):
   a. If minThreshold != null AND value < minThreshold → violation (direction: 'below')
   b. If maxThreshold != null AND value > maxThreshold → violation (direction: 'above')
   c. On violation → dispatch threshold.action
5. Stop at first violation (CRITICAL takes priority over WARNING)
```

### 5.2 Default Rules by Sensor Type

| SensorType         | Level    | Min  | Max  | Action (below min)  | Action (above max)     |
|--------------------|----------|------|------|---------------------|------------------------|
| SOIL_MOISTURE      | WARNING  | 55   | 90   | PUMP_ON             | PUMP_OFF               |
| SOIL_MOISTURE      | CRITICAL | 40   | 95   | PUMP_ON             | SHUTDOWN_PUMP          |
| PUMP_TEMPERATURE   | WARNING  | —    | 70   | —                   | ALERT_ONLY             |
| PUMP_TEMPERATURE   | CRITICAL | —    | 80   | —                   | SHUTDOWN_PUMP          |
| WATER_PRESSURE     | WARNING  | 1.0  | 5.0  | PRESSURE_LOW_ALERT  | PRESSURE_HIGH_ALERT    |
| WATER_PRESSURE     | CRITICAL | 0.5  | 6.0  | SHUTDOWN_PUMP       | SHUTDOWN_PUMP          |
| WATER_FLOW         | WARNING  | 2.0  | 50   | FLOW_LOW_ALERT      | FLOW_HIGH_ALERT        |
| ELECTRICAL_CURRENT | WARNING  | —    | 10   | —                   | ALERT_ONLY             |
| ELECTRICAL_CURRENT | CRITICAL | —    | 15   | —                   | OVERCURRENT_SHUTDOWN   |

These are configurable per device via the REST API — the table above shows recommended defaults.

---

## 6. MQTT Command Dispatch

### Topic

```
device/{deviceId}/cmd
```

This matches the existing topic used by `MqttService.publishToDevice()` at `src/device/mqtt/mqtt.service.ts:177`.

### Payload Format

Uses the existing payload structure from `publishToDevice()`:

```json
{
  "command": "PUMP_ON",
  "data": {
    "reason": "LOW_MOISTURE",
    "sensorType": "soil_moisture",
    "level": "warning",
    "value": 45,
    "threshold": 55
  },
  "timestamp": "2026-02-11T10:30:00.000Z"
}
```

Shutdown example:

```json
{
  "command": "SHUTDOWN_PUMP",
  "data": {
    "reason": "OVER_TEMPERATURE",
    "sensorType": "pump_temperature",
    "level": "critical",
    "value": 82,
    "threshold": 80
  },
  "timestamp": "2026-02-11T10:30:00.000Z"
}
```

---

## 7. Anti-Spam Mechanisms

Two in-memory mechanisms to prevent command flooding:

### 7.1 State Machine

Store current actuator state per device in `ThresholdService`:

```typescript
// Map<deviceId, Map<action, currentState>>
private deviceStates: Map<string, Map<string, boolean>> = new Map();
```

Only dispatch a command when the state changes:
- If pump is already ON → don't send PUMP_ON again
- If pump just turned OFF → allow PUMP_ON

State resets on server restart. Next telemetry re-evaluates and re-establishes state.

### 7.2 Cooldown

Store last action time per device + sensor:

```typescript
// Map<`${deviceId}:${sensorType}`, timestamp>
private lastActionTime: Map<string, number> = new Map();
private readonly COOLDOWN_MS = 30_000; // 30 seconds
```

Block duplicate commands within the cooldown window, even if state changes rapidly.

**Note:** Both mechanisms use in-memory Maps. No Redis needed at current scale. Maps clear on restart, which is safe since the next telemetry reading re-evaluates everything.

---

## 8. Module Structure

### New Module: `SensorModule`

```
src/sensor/
├── sensor.module.ts
├── sensor.service.ts              # Telemetry processing, data storage, config caching
├── sensor.controller.ts           # REST API for configs, thresholds, data, alerts
├── threshold.service.ts           # Threshold evaluation, command dispatch, anti-spam
├── entities/
│   ├── sensor-config.entity.ts
│   ├── sensor-threshold.entity.ts
│   ├── sensor-data.entity.ts
│   └── alert-log.entity.ts
├── enums/
│   ├── sensor-type.enum.ts
│   ├── sensor-mode.enum.ts
│   └── threshold-level.enum.ts
├── constants/
│   └── threshold-rules.ts         # Default threshold values
└── dto/
    ├── create-sensor-config.dto.ts
    ├── update-sensor-config.dto.ts
    ├── create-sensor-threshold.dto.ts
    ├── update-sensor-threshold.dto.ts
    ├── query-sensor-data.dto.ts
    └── query-alert-log.dto.ts
```

### Module Wiring

```
AppModule
  ├── EventEmitterModule.forRoot()     [NEW import]
  ├── SensorModule                     [NEW import]
  ├── DeviceModule                     [existing, exports MqttService/DeviceGateway]
  └── ... other existing modules

SensorModule imports:
  ├── TypeOrmModule.forFeature([SensorConfig, SensorThreshold, SensorData, AlertLog])
  └── DeviceModule  (to get MqttService + DeviceGateway)
```

**Event-based decoupling (no circular dependency):**

```
DeviceModule                          SensorModule
  SyncService                           SensorService
    emits 'telemetry.received' ───→       @OnEvent('telemetry.received')
                                        ThresholdService
                                          injects MqttService (from DeviceModule)
                                          injects DeviceGateway (from DeviceModule)
```

`SensorModule` imports `DeviceModule` (one-way). `DeviceModule` does NOT import `SensorModule`. Communication is via events.

---

## 9. REST API Endpoints

### SensorController (`/api/sensor`)

All endpoints use `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth()`, `@ApiTags('Sensors')`.

#### Sensor Config

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/device/:deviceId/config` | Get all sensor configs for a device |
| POST   | `/device/:deviceId/config` | Create sensor config |
| PATCH  | `/device/:deviceId/config/:id` | Update sensor config (enable/disable, mode) |
| DELETE | `/device/:deviceId/config/:id` | Delete sensor config |

#### Sensor Thresholds

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/config/:configId/threshold` | Get thresholds for a sensor config |
| POST   | `/config/:configId/threshold` | Create threshold (warning/critical) |
| PATCH  | `/config/:configId/threshold/:id` | Update threshold values/action |
| DELETE | `/config/:configId/threshold/:id` | Delete threshold |

#### Sensor Data

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/device/:deviceId/data` | Query sensor data (params: sensorType, from, to, limit) |
| GET    | `/device/:deviceId/data/latest` | Get latest reading per sensor type |

#### Alerts

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/device/:deviceId/alerts` | Query alerts (params: sensorType, level, from, to, acknowledged) |
| PATCH  | `/device/:deviceId/alerts/:id/acknowledge` | Mark alert as acknowledged |

---

## 10. WebSocket Events

Uses existing `DeviceGateway.broadcastDeviceData()` and room `device:{deviceId}`.

| Event | Type Field | Payload | Description |
|-------|-----------|---------|-------------|
| `deviceData` | `telemetry` | `{ type, ...sensorValues, receivedAt }` | Raw telemetry (existing, unchanged) |
| `deviceData` | `alert` | `{ type, deviceId, sensorType, value, threshold, level, direction, action, reason }` | Threshold violation alert (NEW) |
| `deviceData` | `command_dispatched` | `{ type, deviceId, command, data }` | Automated command sent to device (NEW) |

---

## 11. EMQX ACL

**No changes required.** The existing `EmqxService.checkDeviceAcl()` at `src/emqx/emqx.service.ts` uses a wildcard rule: topics starting with `device/{deviceId}/` are allowed. All new functionality uses the existing `device/{deviceId}/cmd` and `device/{deviceId}/telemetry` topics.

---

## 12. Config Caching

`SensorService` caches sensor configs + thresholds in memory to avoid database queries on every telemetry message:

```typescript
private configCache: Map<string, { configs: SensorConfig[]; loadedAt: number }> = new Map();
private readonly CACHE_TTL = 60_000; // 60 seconds

async getConfigsForDevice(deviceId: string): Promise<SensorConfig[]> {
  const cached = this.configCache.get(deviceId);
  if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL) {
    return cached.configs;
  }
  const configs = await this.sensorConfigRepo.find({
    where: { deviceId },
    relations: ['thresholds'],
  });
  this.configCache.set(deviceId, { configs, loadedAt: Date.now() });
  return configs;
}

invalidateCache(deviceId: string) {
  this.configCache.delete(deviceId);
}
```

`invalidateCache()` is called whenever sensor config or threshold is created/updated/deleted via REST API.

---

## 13. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/sensor/sensor.module.ts` | Module declaration |
| `src/sensor/sensor.service.ts` | Telemetry processing, data CRUD, config caching |
| `src/sensor/sensor.controller.ts` | REST endpoints |
| `src/sensor/threshold.service.ts` | Threshold evaluation, command dispatch, anti-spam |
| `src/sensor/entities/sensor-config.entity.ts` | SensorConfig entity |
| `src/sensor/entities/sensor-threshold.entity.ts` | SensorThreshold entity |
| `src/sensor/entities/sensor-data.entity.ts` | SensorData entity (bigint PK) |
| `src/sensor/entities/alert-log.entity.ts` | AlertLog entity |
| `src/sensor/enums/sensor-type.enum.ts` | SensorType enum |
| `src/sensor/enums/sensor-mode.enum.ts` | SensorMode enum (AUTO/MANUAL) |
| `src/sensor/enums/threshold-level.enum.ts` | ThresholdLevel enum (WARNING/CRITICAL) |
| `src/sensor/constants/threshold-rules.ts` | Default threshold values |
| `src/sensor/dto/create-sensor-config.dto.ts` | DTO with class-validator |
| `src/sensor/dto/update-sensor-config.dto.ts` | DTO (PartialType) |
| `src/sensor/dto/create-sensor-threshold.dto.ts` | DTO with class-validator |
| `src/sensor/dto/update-sensor-threshold.dto.ts` | DTO (PartialType) |
| `src/sensor/dto/query-sensor-data.dto.ts` | Query params DTO |
| `src/sensor/dto/query-alert-log.dto.ts` | Query params DTO |

### Modified Files

| File | Change |
|------|--------|
| `src/app.module.ts` | Add `EventEmitterModule.forRoot()` and `SensorModule` to imports |
| `src/device/sync/sync.service.ts` | Inject `EventEmitter2`, emit `'telemetry.received'` event in `handleDeviceTelemetry()` |
| `src/device/entities/device.entity.ts` | Add `@OneToMany(() => SensorConfig, (sc) => sc.device)` relation |
| `package.json` | Add `@nestjs/event-emitter` dependency |

---

## 14. Future Enhancements

- **Hysteresis:** Add `hysteresisMargin` to `SensorThreshold` for separate on/off thresholds
- **Notification channels:** SMS/email/push via a `NotificationModule`
- **Batch inserts:** Buffer sensor_data records and bulk-insert periodically
- **Table partitioning:** PostgreSQL partition `sensor_data` by month when volume grows
- **Redis caching:** Replace in-memory config cache with Redis for multi-instance deployments
- **New sensor types:** Add value to `SensorType` enum + default thresholds (2-line change)
