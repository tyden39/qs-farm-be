---
phase: 3
title: Zone Sensor Config & Threshold CRUD
status: completed
priority: critical
effort: M
blockedBy: [1]
completed: 2026-03-20
---

# Phase 3: Zone Sensor Config & Threshold CRUD

## Overview

Implement CRUD endpoints for ZoneSensorConfig and ZoneThreshold — the zone-level sensor templates that devices inherit from. Also update existing SensorThreshold CRUD to support `irrigationMode` field.

## Context Links

- [Phase 1 - Entities](phase-01-database-entities-module-setup.md)
- [Sensor Service](../../src/sensor/sensor.service.ts) — existing threshold CRUD pattern
- [Sensor Controller](../../src/sensor/sensor.controller.ts) — existing endpoint pattern
- [SensorThreshold Entity](../../src/sensor/entities/sensor-threshold.entity.ts)

## Key Insights

- Follow exact same CRUD pattern as existing `SensorService` threshold methods
- ZoneSensorConfig/ZoneThreshold CRUD lives in ZoneModule (not SensorModule) to avoid circular deps
- Existing SensorThreshold CRUD needs minor update: accept optional `irrigationMode` in create/update DTOs
- Zone threshold unique: (zoneSensorConfigId, level, irrigationMode) — same pattern as device threshold

## Requirements

### Functional
- CRUD for ZoneSensorConfig under a zone
- CRUD for ZoneThreshold under a ZoneSensorConfig
- Update existing CreateSensorThresholdDto/UpdateSensorThresholdDto with optional irrigationMode
- Invalidate relevant caches on zone threshold changes

### Non-functional
- class-validator on all DTOs
- Swagger decorators
- JwtAuthGuard on all endpoints

## Related Code Files

### Files to Create
- `src/zone/dto/create-zone-sensor-config.dto.ts`
- `src/zone/dto/update-zone-sensor-config.dto.ts`
- `src/zone/dto/create-zone-threshold.dto.ts`
- `src/zone/dto/update-zone-threshold.dto.ts`
- `src/zone/zone-sensor-config.service.ts`

### Files to Modify
- `src/zone/zone.module.ts` — add service, repos
- `src/zone/zone.controller.ts` — add zone sensor config/threshold endpoints
- `src/sensor/dto/create-sensor-threshold.dto.ts` — add irrigationMode
- `src/sensor/dto/update-sensor-threshold.dto.ts` — add irrigationMode
- `src/sensor/sensor.service.ts` — cache invalidation awareness

## Implementation Steps

### Step 1: Create Zone Sensor Config DTOs

`create-zone-sensor-config.dto.ts`:
```typescript
export class CreateZoneSensorConfigDto {
  @IsEnum(SensorType)
  sensorType: SensorType;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsEnum(SensorMode)
  mode?: SensorMode;

  @IsOptional() @IsString()
  unit?: string;
}
```

`update-zone-sensor-config.dto.ts` — PartialType.

### Step 2: Create Zone Threshold DTOs

`create-zone-threshold.dto.ts`:
```typescript
export class CreateZoneThresholdDto {
  @IsEnum(ThresholdLevel)
  level: ThresholdLevel;

  @IsOptional() @IsEnum(IrrigationMode)
  irrigationMode?: IrrigationMode;

  @IsOptional() @IsNumber()
  minThreshold?: number;

  @IsOptional() @IsNumber()
  maxThreshold?: number;

  @IsString()
  action: string;
}
```

`update-zone-threshold.dto.ts` — PartialType.

### Step 3: Implement ZoneSensorConfigService

```typescript
@Injectable()
export class ZoneSensorConfigService {
  constructor(
    @InjectRepository(ZoneSensorConfig)
    private readonly configRepo: Repository<ZoneSensorConfig>,
    @InjectRepository(ZoneThreshold)
    private readonly thresholdRepo: Repository<ZoneThreshold>,
  ) {}

  // --- ZoneSensorConfig CRUD ---
  async findAllByZone(zoneId: string) { ... }  // relations: thresholds
  async createConfig(zoneId: string, dto: CreateZoneSensorConfigDto) { ... }
  async updateConfig(zoneId: string, id: string, dto) { ... }
  async removeConfig(zoneId: string, id: string) { ... }

  // --- ZoneThreshold CRUD ---
  async findAllThresholds(configId: string) { ... }
  async createThreshold(configId: string, dto: CreateZoneThresholdDto) { ... }
  async updateThreshold(configId: string, id: string, dto) { ... }
  async removeThreshold(configId: string, id: string) { ... }

  // --- Helper for resolution (Phase 4) ---
  async getConfigsForZone(zoneId: string): Promise<ZoneSensorConfig[]> { ... }
}
```

### Step 4: Add endpoints to ZoneController

Nest under zone routes:
- `GET /api/zone/:zoneId/sensor-config` — list zone sensor configs
- `POST /api/zone/:zoneId/sensor-config` — create
- `PATCH /api/zone/:zoneId/sensor-config/:configId` — update
- `DELETE /api/zone/:zoneId/sensor-config/:configId` — delete
- `GET /api/zone/:zoneId/sensor-config/:configId/threshold` — list thresholds
- `POST /api/zone/:zoneId/sensor-config/:configId/threshold` — create
- `PATCH /api/zone/:zoneId/sensor-config/:configId/threshold/:thresholdId` — update
- `DELETE /api/zone/:zoneId/sensor-config/:configId/threshold/:thresholdId` — delete

### Step 5: Update existing SensorThreshold DTOs

Add to `CreateSensorThresholdDto` and `UpdateSensorThresholdDto`:
```typescript
@IsOptional() @IsEnum(IrrigationMode)
irrigationMode?: IrrigationMode;
```

### Step 6: Compile check

Run `yarn build`.

## Todo List

- [x] Create ZoneSensorConfig DTOs
- [x] Create ZoneThreshold DTOs
- [x] Implement ZoneSensorConfigService
- [x] Add zone sensor config/threshold endpoints to ZoneController
- [x] Update ZoneModule (repos, service)
- [x] Update existing SensorThreshold DTOs (irrigationMode)
- [x] Run `yarn build` — verify no errors

## Success Criteria

- Zone sensor config/threshold CRUD works via REST API
- Existing device sensor threshold CRUD still works
- irrigationMode can be set on both zone and device thresholds
- Swagger docs show new endpoints

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Duplicate (zoneId, sensorType) on create | Unique constraint + proper error handling |
| Nullable irrigationMode in unique constraint | PostgreSQL treats NULLs as distinct — multiple NULL rows allowed. This is correct behavior (default threshold) |
