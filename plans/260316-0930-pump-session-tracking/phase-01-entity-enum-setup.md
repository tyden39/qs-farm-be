# Phase 1: Entity & Enum Setup

## Context Links

- [Device Entity](../../src/device/entities/device.entity.ts)
- [SensorType Enum](../../src/sensor/enums/sensor-type.enum.ts)
- [AlertLog Entity](../../src/sensor/entities/alert-log.entity.ts) -- reference pattern
- [CommandLog Entity](../../src/sensor/entities/command-log.entity.ts) -- reference pattern
- [CreateDeviceDto](../../src/device/dto/create-device.dto.ts)

## Overview

- **Priority:** P1 (foundation for all subsequent phases)
- **Status:** completed
- **Description:** Create PumpSession entity, enums, and modify Device entity + SensorType enum

## Key Insights

- Codebase uses UUID PKs everywhere except SensorData (bigint for time-series). PumpSession uses UUID since it's not high-volume time-series.
- Enums use lowercase string values in DB (matches `DeviceStatus`, `SensorType`, `ThresholdLevel` patterns).
- `synchronize: true` auto-syncs schema -- no migrations needed.
- `PAYLOAD_TO_SENSOR_TYPE` maps ESP payload keys to `SensorType` values. PUMP_STATUS uses key `pumpStatus`.
- PUMP_STATUS must NOT be stored in SensorData -- it only triggers events. SensorService iterates `PAYLOAD_TO_SENSOR_TYPE` to create `SensorData` entries, so we need to filter it out in `SensorService.processTelemetry()`.

## Requirements

**Functional:**
- PumpSession entity with all session fields, sensor aggregates, overcurrent data
- PumpSessionStatus enum: `active`, `completed`, `interrupted`
- InterruptedReason enum: `lwt`, `esp_reboot`, `timeout`
- PUMP_STATUS added to SensorType enum + PAYLOAD_TO_SENSOR_TYPE + SENSOR_TYPE_LABEL
- Device entity gets `operatingLifeHours` (nullable) and `totalOperatingHours` (default 0)

**Non-functional:**
- Indexes on (deviceId, startedAt) and (deviceId, sessionNumber) for query performance
- Session aggregates stored as `float` (matches AlertLog pattern)

## Architecture

PumpSession relates to Device via ManyToOne. No cascade -- sessions persist if device is deleted (historical data).

```
Device (1) ---> (M) PumpSession
  + operatingLifeHours: float | null
  + totalOperatingHours: float (default 0)
```

## Related Code Files

**Create:**
- `src/pump/entities/pump-session.entity.ts`
- `src/pump/enums/pump-session-status.enum.ts`
- `src/pump/enums/interrupted-reason.enum.ts`

**Modify:**
- `src/sensor/enums/sensor-type.enum.ts`
- `src/device/entities/device.entity.ts`
- `src/device/dto/create-device.dto.ts`
- `src/sensor/sensor.service.ts` (skip PUMP_STATUS in processTelemetry)

## Implementation Steps

### Step 1: Create PumpSessionStatus enum

Create `src/pump/enums/pump-session-status.enum.ts`:

```typescript
export enum PumpSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  INTERRUPTED = 'interrupted',
}
```

### Step 2: Create InterruptedReason enum

Create `src/pump/enums/interrupted-reason.enum.ts`:

```typescript
export enum InterruptedReason {
  LWT = 'lwt',
  ESP_REBOOT = 'esp_reboot',
  TIMEOUT = 'timeout',
}
```

### Step 3: Create PumpSession entity

Create `src/pump/entities/pump-session.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { Device } from 'src/device/entities/device.entity';
import { PumpSessionStatus } from '../enums/pump-session-status.enum';
import { InterruptedReason } from '../enums/interrupted-reason.enum';

@Entity()
@Index(['deviceId', 'startedAt'])
@Index(['deviceId', 'sessionNumber'])
export class PumpSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ type: 'int' })
  sessionNumber: number;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @Column({ type: 'float', nullable: true })
  durationSeconds: number;

  // --- Temperature aggregates ---
  @Column({ type: 'float', nullable: true })
  tempMin: number;

  @Column({ type: 'float', nullable: true })
  tempMax: number;

  @Column({ type: 'float', nullable: true })
  tempAvg: number;

  // --- Pressure aggregates ---
  @Column({ type: 'float', nullable: true })
  pressureMin: number;

  @Column({ type: 'float', nullable: true })
  pressureMax: number;

  @Column({ type: 'float', nullable: true })
  pressureAvg: number;

  // --- Flow aggregates ---
  @Column({ type: 'float', nullable: true })
  flowMin: number;

  @Column({ type: 'float', nullable: true })
  flowMax: number;

  @Column({ type: 'float', nullable: true })
  flowTotal: number;

  // --- Current aggregates ---
  @Column({ type: 'float', nullable: true })
  currentMin: number;

  @Column({ type: 'float', nullable: true })
  currentMax: number;

  @Column({ type: 'float', nullable: true })
  currentAvg: number;

  // --- Phase count ---
  @Column({ type: 'int', default: 0 })
  phaseCount: number;

  // --- Overcurrent detection ---
  @Column({ type: 'boolean', default: false })
  overcurrentDetected: boolean;

  @Column({ type: 'int', default: 0 })
  overcurrentCount: number;

  @Column({ type: 'float', nullable: true })
  overcurrentMaxCurrent: number;

  // --- Alert flag ---
  @Column({ type: 'boolean', default: false })
  hasAlert: boolean;

  // --- Session status ---
  @Column({
    type: 'enum',
    enum: PumpSessionStatus,
    default: PumpSessionStatus.ACTIVE,
  })
  status: PumpSessionStatus;

  @Column({
    type: 'enum',
    enum: InterruptedReason,
    nullable: true,
  })
  interruptedReason: InterruptedReason;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Step 4: Add PUMP_STATUS to SensorType enum

In `src/sensor/enums/sensor-type.enum.ts`, add:

```typescript
export enum SensorType {
  WATER_PRESSURE = 'water_pressure',
  WATER_FLOW = 'water_flow',
  PUMP_TEMPERATURE = 'pump_temperature',
  SOIL_MOISTURE = 'soil_moisture',
  ELECTRICAL_CURRENT = 'electrical_current',
  ELECTRICAL_PHASE = 'electrical_phase',
  PUMP_STATUS = 'pump_status',          // <-- ADD
}
```

Add to SENSOR_TYPE_LABEL:
```typescript
[SensorType.PUMP_STATUS]: 'Trạng thái bơm',
```

Add to PAYLOAD_TO_SENSOR_TYPE:
```typescript
pumpStatus: SensorType.PUMP_STATUS,
```

### Step 5: Skip PUMP_STATUS in SensorService.processTelemetry

In `src/sensor/sensor.service.ts`, inside `processTelemetry()`, filter out PUMP_STATUS from the readings array BEFORE bulk insert. PUMP_STATUS is a trigger signal, not a persisted sensor value.

After the existing readings loop (line ~83), add filter:

```typescript
// Filter out PUMP_STATUS -- it triggers events only, not stored as sensor data
const storableReadings = readings.filter(
  (r) => r.sensorType !== SensorType.PUMP_STATUS,
);

if (storableReadings.length === 0) return;

// Bulk insert sensor data (use storableReadings instead of readings)
const sensorDataEntities = storableReadings.map((r) =>
  this.sensorDataRepo.create({
    deviceId,
    sensorType: r.sensorType as any,
    value: r.value,
  }),
);
```

Also add import at top:
```typescript
import { PAYLOAD_TO_SENSOR_TYPE, SensorType } from './enums/sensor-type.enum';
```

Note: The threshold evaluation loop still uses the original `readings` (not `storableReadings`) so PUMP_STATUS doesn't get evaluated for thresholds since it won't have a matching SensorConfig.

### Step 6: Add operating life fields to Device entity

In `src/device/entities/device.entity.ts`, add two columns after `pairedAt`:

```typescript
@Column({ type: 'float', nullable: true })
operatingLifeHours: number;

@Column({ type: 'float', default: 0 })
totalOperatingHours: number;
```

### Step 7: Expose operatingLifeHours in CreateDeviceDto

In `src/device/dto/create-device.dto.ts`, add:

```typescript
import { IsString, IsOptional, IsUUID, IsNumber } from 'class-validator';

// Add to class body:
@IsOptional()
@IsNumber()
readonly operatingLifeHours?: number;
```

Since `UpdateDeviceDto` extends `PartialType(CreateDeviceDto)`, it automatically inherits `operatingLifeHours` as optional.

## Todo List

- [ ] Create `src/pump/enums/pump-session-status.enum.ts`
- [ ] Create `src/pump/enums/interrupted-reason.enum.ts`
- [ ] Create `src/pump/entities/pump-session.entity.ts`
- [ ] Add PUMP_STATUS to `SensorType` enum
- [ ] Add PUMP_STATUS to `SENSOR_TYPE_LABEL`
- [ ] Add `pumpStatus` to `PAYLOAD_TO_SENSOR_TYPE`
- [ ] Filter PUMP_STATUS from SensorData storage in `sensor.service.ts`
- [ ] Add `operatingLifeHours` and `totalOperatingHours` to Device entity
- [ ] Add `operatingLifeHours` to `CreateDeviceDto`
- [ ] Run `yarn build` to verify compilation

## Success Criteria

- `yarn build` compiles without errors
- Database auto-syncs new `pump_session` table with correct columns and indexes
- Device table gains `operatingLifeHours` (nullable float) and `totalOperatingHours` (float default 0)
- PUMP_STATUS telemetry payloads are NOT stored in SensorData

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Adding PUMP_STATUS enum changes SensorData column type | Low -- TypeORM `synchronize` handles enum additions | Verify schema sync on dev |
| SensorService threshold loop processes PUMP_STATUS | None -- PUMP_STATUS won't have a SensorConfig, so the `configs.find()` returns undefined and skips | No action needed |
| Existing Device rows lack new columns | None -- `operatingLifeHours` is nullable, `totalOperatingHours` defaults to 0 | Auto-handled by TypeORM |
