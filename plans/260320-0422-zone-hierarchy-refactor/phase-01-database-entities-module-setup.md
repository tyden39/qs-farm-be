---
phase: 1
title: Database Entities & Module Setup
status: completed
priority: critical
effort: M
blockedBy: []
completed: 2026-03-20
---

# Phase 1: Database Entities & Module Setup

## Overview

Create new entities (Zone, ZoneSensorConfig, ZoneThreshold), modify existing entities (Farm, Device, SensorThreshold, DeviceSchedule), and set up ZoneModule. This is the foundation for all subsequent phases.

## Context Links

- [Brainstorm Report](../reports/brainstorm-260320-0422-zone-hierarchy-refactor.md)
- [Farm Entity](../../src/farm/entities/farm.entity.ts)
- [Device Entity](../../src/device/entities/device.entity.ts)
- [SensorThreshold Entity](../../src/sensor/entities/sensor-threshold.entity.ts)
- [DeviceSchedule Entity](../../src/schedule/entities/device-schedule.entity.ts)
- [PumpOperationMode Enum](../../src/pump/enums/pump-operation-mode.enum.ts)
- [PumpControlMode Enum](../../src/pump/enums/pump-control-mode.enum.ts)

## Key Insights

- TypeORM `synchronize: true` handles schema migration automatically
- Reuse existing enums: `PumpOperationMode` (irrigationMode) and `PumpControlMode` (controlMode)—move to shared location
- Device.zoneId must be nullable for backward compat (existing devices have no zone)
- Farm/Zone coordinates stored as `jsonb` (array of `{lat, lng}`)
- Device coordinates as 2 float columns (single point)

## Requirements

### Functional
- Zone entity with farmId FK, name, image, coordinates, irrigationMode, controlMode, checkAll, pumpEnabled
- ZoneSensorConfig entity with zoneId FK, sensorType, enabled, mode, unit
- ZoneThreshold entity with zoneSensorConfigId FK, level, irrigationMode (nullable), min/max, action
- Farm gains `coordinates` column
- Device gains `zoneId`, `latitude`, `longitude`, `irrigationMode`, `controlMode`
- SensorThreshold gains `irrigationMode` column, unique constraint changes
- DeviceSchedule gains `zoneId` column

### Non-functional
- All new entities use UUID PKs
- Proper indexes on FKs
- Cascade deletes where appropriate

## Architecture

```
Farm (modified)
  +coordinates: jsonb

Zone (NEW) ──→ Farm
  +farmId, name, image, coordinates
  +irrigationMode, controlMode, checkAll, pumpEnabled

Device (modified) ──→ Zone (nullable)
  +zoneId, latitude, longitude
  +irrigationMode (nullable), controlMode (nullable)

ZoneSensorConfig (NEW) ──→ Zone
  +zoneId, sensorType, enabled, mode, unit
  Unique: (zoneId, sensorType)

ZoneThreshold (NEW) ──→ ZoneSensorConfig
  +zoneSensorConfigId, level, irrigationMode (nullable)
  +minThreshold, maxThreshold, action
  Unique: (zoneSensorConfigId, level, irrigationMode)

SensorThreshold (modified)
  +irrigationMode (nullable)
  Unique changes: (sensorConfigId, level, irrigationMode)

DeviceSchedule (modified)
  +zoneId (nullable)
```

## Related Code Files

### Files to Create
- `src/shared/enums/irrigation-mode.enum.ts` — moved from pump module
- `src/shared/enums/control-mode.enum.ts` — moved from pump module
- `src/zone/entities/zone.entity.ts`
- `src/zone/entities/zone-sensor-config.entity.ts`
- `src/zone/entities/zone-threshold.entity.ts`
- `src/zone/zone.module.ts`

### Files to Modify
- `src/farm/entities/farm.entity.ts` — add coordinates
- `src/device/entities/device.entity.ts` — add zoneId, lat, lng, irrigationMode, controlMode
- `src/sensor/entities/sensor-threshold.entity.ts` — add irrigationMode, change unique
- `src/schedule/entities/device-schedule.entity.ts` — add zoneId
- `src/pump/entities/pump-session.entity.ts` — update imports to shared enums
- `src/pump/enums/pump-operation-mode.enum.ts` — deprecate, re-export from shared
- `src/pump/enums/pump-control-mode.enum.ts` — deprecate, re-export from shared
- `src/app.module.ts` — register ZoneModule

## Implementation Steps

### Step 1: Create shared enums

Create `src/shared/enums/irrigation-mode.enum.ts`:
```typescript
export enum IrrigationMode {
  NORMAL = 'normal',
  SPRAY = 'spray',
  ROOT = 'root',
  DRIP = 'drip',
}
```

Create `src/shared/enums/control-mode.enum.ts`:
```typescript
export enum ControlMode {
  AUTO = 'auto',
  MANUAL = 'manual',
  SCHEDULE = 'schedule',
}
```

Update `src/pump/enums/pump-operation-mode.enum.ts` and `pump-control-mode.enum.ts` to re-export from shared (backward compat).

### Step 2: Create Zone entity

`src/zone/entities/zone.entity.ts`:
```typescript
@Entity()
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', default: '', nullable: true })
  image: string;

  @Column('uuid')
  farmId: string;

  @ManyToOne(() => Farm, (farm) => farm.zones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column({ type: 'jsonb', default: [] })
  coordinates: { lat: number; lng: number }[];

  @Column({ type: 'enum', enum: IrrigationMode, default: IrrigationMode.NORMAL })
  irrigationMode: IrrigationMode;

  @Column({ type: 'enum', enum: ControlMode, default: ControlMode.MANUAL })
  controlMode: ControlMode;

  @Column({ type: 'boolean', default: false })
  checkAll: boolean;

  @Column({ type: 'boolean', default: false })
  pumpEnabled: boolean;

  @OneToMany(() => Device, (device) => device.zone)
  devices: Device[];

  @OneToMany(() => ZoneSensorConfig, (zsc) => zsc.zone)
  sensorConfigs: ZoneSensorConfig[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 3: Create ZoneSensorConfig entity

`src/zone/entities/zone-sensor-config.entity.ts`:
```typescript
@Entity()
@Unique(['zoneId', 'sensorType'])
export class ZoneSensorConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  zoneId: string;

  @ManyToOne(() => Zone, (zone) => zone.sensorConfigs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneId' })
  zone: Zone;

  @Column({ type: 'enum', enum: SensorType })
  sensorType: SensorType;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'enum', enum: SensorMode, default: SensorMode.AUTO })
  mode: SensorMode;

  @Column({ type: 'varchar', nullable: true })
  unit: string;

  @OneToMany(() => ZoneThreshold, (zt) => zt.zoneSensorConfig, { cascade: true })
  thresholds: ZoneThreshold[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 4: Create ZoneThreshold entity

`src/zone/entities/zone-threshold.entity.ts`:
```typescript
@Entity()
@Unique(['zoneSensorConfigId', 'level', 'irrigationMode'])
export class ZoneThreshold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  zoneSensorConfigId: string;

  @ManyToOne(() => ZoneSensorConfig, (zsc) => zsc.thresholds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneSensorConfigId' })
  zoneSensorConfig: ZoneSensorConfig;

  @Column({ type: 'enum', enum: ThresholdLevel })
  level: ThresholdLevel;

  @Column({ type: 'enum', enum: IrrigationMode, nullable: true })
  irrigationMode: IrrigationMode;

  @Column({ type: 'float', nullable: true })
  minThreshold: number;

  @Column({ type: 'float', nullable: true })
  maxThreshold: number;

  @Column({ type: 'varchar' })
  action: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 5: Modify Farm entity

Add to `src/farm/entities/farm.entity.ts`:
```typescript
@Column({ type: 'jsonb', default: [] })
coordinates: { lat: number; lng: number }[];

@OneToMany(() => Zone, (zone) => zone.farm)
zones: Zone[];
```

### Step 6: Modify Device entity

Add to `src/device/entities/device.entity.ts`:
```typescript
@Column('uuid', { nullable: true })
zoneId: string;

@ManyToOne(() => Zone, (zone) => zone.devices)
@JoinColumn({ name: 'zoneId' })
zone: Zone;

@Column({ type: 'float', nullable: true })
latitude: number;

@Column({ type: 'float', nullable: true })
longitude: number;

@Column({ type: 'enum', enum: IrrigationMode, nullable: true })
irrigationMode: IrrigationMode;

@Column({ type: 'enum', enum: ControlMode, nullable: true })
controlMode: ControlMode;
```

### Step 7: Modify SensorThreshold entity

Add `irrigationMode` column to `src/sensor/entities/sensor-threshold.entity.ts`:
```typescript
@Column({ type: 'enum', enum: IrrigationMode, nullable: true })
irrigationMode: IrrigationMode;
```
Change `@Unique` from `['sensorConfigId', 'level']` to `['sensorConfigId', 'level', 'irrigationMode']`.

### Step 8: Modify DeviceSchedule entity

Add `zoneId` column to `src/schedule/entities/device-schedule.entity.ts`:
```typescript
@Column('uuid', { nullable: true })
zoneId: string;

@ManyToOne(() => Zone, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'zoneId' })
zone: Zone;
```

### Step 9: Create ZoneModule

`src/zone/zone.module.ts`:
```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Zone, ZoneSensorConfig, ZoneThreshold]),
    FilesModule,
  ],
  controllers: [ZoneController],
  providers: [ZoneService],
  exports: [ZoneService],
})
export class ZoneModule {}
```

Register in `src/app.module.ts`.

### Step 10: Compile check

Run `yarn build` to verify all entities sync and no TypeScript errors.

## Todo List

- [x] Create shared enums (IrrigationMode, ControlMode)
- [x] Update pump enums to re-export from shared
- [x] Create Zone entity
- [x] Create ZoneSensorConfig entity
- [x] Create ZoneThreshold entity
- [x] Modify Farm entity (coordinates, zones relation)
- [x] Modify Device entity (zoneId, lat/lng, irrigationMode, controlMode)
- [x] Modify SensorThreshold entity (irrigationMode, unique constraint)
- [x] Modify DeviceSchedule entity (zoneId)
- [x] Create ZoneModule skeleton
- [x] Register ZoneModule in AppModule
- [x] Run `yarn build` — verify no errors

## Success Criteria

- All entities compile without errors
- TypeORM synchronize creates correct tables/columns
- No existing functionality broken
- Shared enums work across pump + zone modules

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| TypeORM sync issues with existing data | zoneId nullable, irrigationMode nullable |
| Circular imports shared↔pump | Re-export pattern, no circular deps |
| Unique constraint change on SensorThreshold | Nullable irrigationMode → NULL treated as distinct by PG |

## Security Considerations

- No new auth endpoints
- Zone access must be scoped to farm owner (enforced in Phase 2 controller)
