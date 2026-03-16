# Phase 2: PumpModule Foundation

## Context Links

- [Phase 1: Entity & Enum Setup](./phase-01-entity-enum-setup.md)
- [SensorModule](../../src/sensor/sensor.module.ts) -- reference pattern
- [ScheduleModule](../../src/schedule/schedule.module.ts) -- reference pattern
- [AppModule](../../src/app.module.ts)

## Overview

- **Priority:** P1
- **Status:** completed
- **Description:** Create PumpModule, PumpService skeleton, PumpController skeleton, and register in AppModule

## Key Insights

- Follows existing module pattern: TypeOrmModule.forFeature for entities, import DeviceModule for MqttService/SyncService/DeviceGateway access.
- PumpService needs: PumpSession repo, Device repo, SensorData repo, AlertLog repo, MqttService, EventEmitter2, DeviceGateway.
- PumpService needs SensorData and AlertLog repos for aggregate queries when closing sessions -- import these via TypeOrmModule.forFeature directly (same pattern as SensorModule importing Device entity).
- Controller needs JwtAuthGuard (same pattern as SensorController).

## Requirements

**Functional:**
- PumpModule imports PumpSession, Device, SensorData, AlertLog entities
- PumpModule imports DeviceModule (for MqttService, SyncService exports)
- PumpService skeleton with all injected dependencies
- PumpController skeleton with JwtAuthGuard
- AppModule registers PumpModule

**Non-functional:**
- Follows existing module organization patterns exactly

## Related Code Files

**Create:**
- `src/pump/pump.module.ts`
- `src/pump/pump.service.ts`
- `src/pump/pump.controller.ts`

**Modify:**
- `src/app.module.ts`

## Implementation Steps

### Step 1: Create PumpService skeleton

Create `src/pump/pump.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { PumpSession } from './entities/pump-session.entity';
import { Device } from 'src/device/entities/device.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name);

  constructor(
    @InjectRepository(PumpSession)
    private readonly pumpSessionRepo: Repository<PumpSession>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(SensorData)
    private readonly sensorDataRepo: Repository<SensorData>,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // Event handlers will be added in Phase 3
  // Stale session cron will be added in Phase 4
  // Report methods will be added in Phase 5
  // Excel export will be added in Phase 6
}
```

### Step 2: Create PumpController skeleton

Create `src/pump/pump.controller.ts`:

```typescript
import { Controller, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PumpService } from './pump.service';

@ApiTags('Pump Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pump')
export class PumpController {
  constructor(private readonly pumpService: PumpService) {}

  // Report endpoints will be added in Phase 5
}
```

### Step 3: Create PumpModule

Create `src/pump/pump.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PumpSession } from './entities/pump-session.entity';
import { Device } from 'src/device/entities/device.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { DeviceModule } from 'src/device/device.module';
import { PumpService } from './pump.service';
import { PumpController } from './pump.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PumpSession, Device, SensorData, AlertLog]),
    DeviceModule,
  ],
  controllers: [PumpController],
  providers: [PumpService],
  exports: [PumpService],
})
export class PumpModule {}
```

### Step 4: Register PumpModule in AppModule

In `src/app.module.ts`, add import and register:

```typescript
import { PumpModule } from './pump/pump.module';

// In @Module imports array, add after SensorModule:
PumpModule,
```

Full imports array becomes:
```typescript
imports: [
  // ... existing imports ...
  SensorModule,
  ScheduleModule,
  FirmwareModule,
  NotificationModule,
  CoffeePriceModule,
  PumpModule,          // <-- ADD
],
```

### Step 5: Verify build

Run `yarn build` to confirm no circular dependencies or missing imports.

## Todo List

- [ ] Create `src/pump/pump.service.ts` (skeleton)
- [ ] Create `src/pump/pump.controller.ts` (skeleton)
- [ ] Create `src/pump/pump.module.ts`
- [ ] Add `PumpModule` to `src/app.module.ts` imports
- [ ] Run `yarn build` to verify compilation

## Success Criteria

- `yarn build` compiles without errors
- No circular dependency warnings in console
- PumpModule is registered and NestJS discovers PumpSession entity (auto-schema sync)
- Swagger shows `Pump Sessions` tag at `/api`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular dependency PumpModule <-> DeviceModule | Medium | PumpModule imports DeviceModule (one-way). PumpModule does NOT import SensorModule -- it accesses SensorData/AlertLog repos directly via TypeOrmModule.forFeature |
| DeviceModule not exporting MqttService/DeviceGateway | None | Already exported: `exports: [DeviceService, MqttService, DeviceGateway, SyncService]` |
