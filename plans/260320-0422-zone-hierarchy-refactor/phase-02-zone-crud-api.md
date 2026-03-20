---
phase: 2
title: Zone CRUD & API
status: completed
priority: critical
effort: M
blockedBy: [1]
completed: 2026-03-20
---

# Phase 2: Zone CRUD & API

## Overview

Implement full CRUD REST API for Zone management, including DTOs, validation, farm-scoped access control, coordinates management, and updating Farm endpoints to include zones.

## Context Links

- [Phase 1 - Entities](phase-01-database-entities-module-setup.md)
- [Farm Controller](../../src/farm/farm.controller.ts) — pattern reference
- [Farm Service](../../src/farm/farm.service.ts) — pattern reference
- [Device Controller](../../src/device/device.controller.ts) — pattern reference
- [Code Standards - Controller/DTO patterns](../../docs/code-standards.md)

## Key Insights

- Follow existing CRUD pattern from FarmService/FarmController
- Zone must be scoped to farm → farm scoped to user (authorization chain)
- Coordinates update is part of zone/farm update (no separate endpoint)
- Device assignment to zone handled via Device update (existing endpoint)
- Farm.findOne should eagerly load zones

## Requirements

### Functional
- CRUD endpoints for Zone under a farm: `POST/GET/PATCH/DELETE /api/zone`
- Create zone with upload (image) following farm's `createWithUpload` pattern
- Update Farm DTO to accept coordinates
- Update Device DTO to accept zoneId, latitude, longitude, irrigationMode, controlMode
- Farm findAll/findOne returns zones relation
- Zone findOne returns devices + sensorConfigs

### Non-functional
- class-validator on all DTOs
- Swagger decorators
- JwtAuthGuard on all endpoints
- Verify farm ownership before zone operations

## Related Code Files

### Files to Create
- `src/zone/dto/create-zone.dto.ts`
- `src/zone/dto/update-zone.dto.ts`
- `src/zone/zone.service.ts`
- `src/zone/zone.controller.ts`

### Files to Modify
- `src/zone/zone.module.ts` — wire service + controller
- `src/farm/dto/create-farm.dto.ts` — add coordinates
- `src/farm/dto/update-farm.dto.ts` — add coordinates
- `src/farm/farm.service.ts` — include zones in queries
- `src/device/dto/create-device.dto.ts` — add zoneId, lat, lng
- `src/device/dto/update-device.dto.ts` — add zoneId, lat, lng, irrigationMode, controlMode
- `src/device/device.service.ts` — sync farmId when zoneId changes

## Implementation Steps

### Step 1: Create Zone DTOs

`create-zone.dto.ts`:
```typescript
export class CreateZoneDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  image?: string;

  @IsUUID()
  farmId: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true }) @Type(() => CoordinateDto)
  coordinates?: { lat: number; lng: number }[];

  @IsOptional() @IsEnum(IrrigationMode)
  irrigationMode?: IrrigationMode;

  @IsOptional() @IsEnum(ControlMode)
  controlMode?: ControlMode;
}
```

`update-zone.dto.ts` — PartialType of CreateZoneDto (omit farmId).

Also create `src/zone/dto/coordinate.dto.ts` for nested validation:
```typescript
export class CoordinateDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
}
```

### Step 2: Implement ZoneService

```typescript
@Injectable()
export class ZoneService {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepo: Repository<Zone>,
  ) {}

  async findAllByFarm(farmId: string): Promise<Zone[]> { ... }
  async findOne(id: string): Promise<Zone> { ... }  // relations: devices, sensorConfigs
  async create(dto: CreateZoneDto): Promise<Zone> { ... }
  async update(id: string, dto: UpdateZoneDto): Promise<Zone> { ... }
  async remove(id: string): Promise<void> { ... }
  async findByIdWithDevices(id: string): Promise<Zone> { ... }
}
```

### Step 3: Implement ZoneController

Endpoints:
- `GET /api/zone?farmId=` — list zones by farm
- `GET /api/zone/:id` — get zone detail (with devices, sensorConfigs)
- `POST /api/zone` — create zone
- `POST /api/zone/upload` — create zone with image upload
- `PATCH /api/zone/:id` — update zone
- `DELETE /api/zone/:id` — delete zone

All protected with `@UseGuards(JwtAuthGuard)`.

### Step 4: Update Farm DTOs & Service

Add `coordinates` to `CreateFarmDto` and `UpdateFarmDto`:
```typescript
@IsOptional() @IsArray()
@ValidateNested({ each: true }) @Type(() => CoordinateDto)
coordinates?: { lat: number; lng: number }[];
```

Update `FarmService.findAll()` and `findOne()` to include `zones` relation.

### Step 5: Update Device DTOs & Service

Add to `UpdateDeviceDto`:
```typescript
@IsOptional() @IsUUID()
zoneId?: string;

@IsOptional() @IsNumber()
latitude?: number;

@IsOptional() @IsNumber()
longitude?: number;

@IsOptional() @IsEnum(IrrigationMode)
irrigationMode?: IrrigationMode;

@IsOptional() @IsEnum(ControlMode)
controlMode?: ControlMode;
```

Update `DeviceService.update()` — when `zoneId` changes, auto-sync `farmId`:
```typescript
if (dto.zoneId) {
  const zone = await this.zoneRepo.findOne(dto.zoneId);
  if (zone) device.farmId = zone.farmId;
}
```

This requires injecting Zone repository into DeviceModule (import ZoneModule or TypeOrmModule.forFeature([Zone])).

### Step 6: Compile check

Run `yarn build`.

## Todo List

- [x] Create CoordinateDto
- [x] Create CreateZoneDto, UpdateZoneDto
- [x] Implement ZoneService (CRUD)
- [x] Implement ZoneController (REST endpoints)
- [x] Update ZoneModule (wire service, controller)
- [x] Update Farm DTOs (coordinates)
- [x] Update FarmService (include zones relation)
- [x] Update Device DTOs (zoneId, lat, lng, irrigationMode, controlMode)
- [x] Update DeviceService (farmId sync on zone change)
- [x] Run `yarn build` — verify no errors

## Success Criteria

- Zone CRUD works via REST API
- Farm queries return zones
- Device can be assigned to zone, farmId auto-syncs
- Swagger docs show new endpoints
- Existing farm/device endpoints still work

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| DeviceModule circular dep with ZoneModule | Use TypeOrmModule.forFeature([Zone]) in DeviceModule instead of importing ZoneModule |
| Orphaned devices when zone deleted | CASCADE delete on Zone→Device FK, or set null |

## Security Considerations

- Zone operations must verify user owns the parent farm
- Device zone assignment must verify zone belongs to same farm
