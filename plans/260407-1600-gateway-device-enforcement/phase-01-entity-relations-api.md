# Phase 01 — Entity Relations + Device-Gateway API

## Overview

- **Priority:** P1
- **Status:** completed
- **Effort:** 2h
- **Depends on:** none

Add `@ManyToOne Gateway` relation on Device entity, `@OneToMany Device` on Gateway entity, and REST endpoints for device↔gateway assignment + listing.

## Key Insights

- `Device.gatewayId` column already exists (nullable uuid) — just need TypeORM relation decorators
- Gateway entity needs `@OneToMany` back-reference for querying devices per gateway
- Assignment API: admin/user assigns devices to gateway manually (auto-discovery in Phase 03)
- Validate same farm: `device.farmId === gateway.farmId` before assignment

## Related Files

**Modify:**
- `src/device/entities/device.entity.ts` — add `@ManyToOne(() => Gateway)` + `gateway` property
- `src/gateway/entities/gateway.entity.ts` — add `@OneToMany(() => Device)` + `devices` property
- `src/gateway/gateway.service.ts` — add `assignDevices()`, `unassignDevices()`, `findDevicesByGateway()`
- `src/gateway/gateway.controller.ts` — add endpoints

**Create:**
- `src/gateway/dto/assign-devices.dto.ts`

## Data Model Changes

```typescript
// device.entity.ts — ADD relation (column already exists)
@ManyToOne(() => Gateway, (gw) => gw.devices, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'gatewayId' })
gateway: Gateway;

// gateway.entity.ts — ADD back-reference
@OneToMany(() => Device, (device) => device.gateway)
devices: Device[];
```

## Implementation Steps

### 1. Update Device entity

File: `src/device/entities/device.entity.ts`

Add import for Gateway (use `type` import to avoid circular):
```typescript
import type { Gateway } from 'src/gateway/entities/gateway.entity';
```

Add relation decorator to existing `gatewayId` column:
```typescript
@ManyToOne('Gateway', (gw: any) => gw.devices, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'gatewayId' })
gateway: Gateway;
```

Use string-based relation `'Gateway'` to avoid circular dependency (same pattern as Zone relation already in entity).

### 2. Update Gateway entity

File: `src/gateway/entities/gateway.entity.ts`

```typescript
@OneToMany('Device', (device: any) => device.gateway)
devices: Device[];
```

### 3. Create AssignDevicesDto

File: `src/gateway/dto/assign-devices.dto.ts`

```typescript
import { IsArray, IsUUID } from 'class-validator';

export class AssignDevicesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds: string[];
}
```

### 4. Add GatewayService methods

File: `src/gateway/gateway.service.ts`

```typescript
async assignDevices(gatewayId: string, deviceIds: string[]): Promise<{ assigned: number }> {
  const gateway = await this.findOne(gatewayId);

  // Only assign devices in same farm
  const devices = await this.deviceRepository.find({
    where: { id: In(deviceIds), farmId: gateway.farmId },
  });

  if (devices.length === 0) {
    throw new BadRequestException('No valid devices found in same farm');
  }

  await this.deviceRepository.update(
    { id: In(devices.map(d => d.id)) },
    { gatewayId },
  );

  // Invalidate ACL cache (Phase 02 will add this)
  this.eventEmitter.emit('gateway.devices.changed', { gatewayId });

  return { assigned: devices.length };
}

async unassignDevices(gatewayId: string, deviceIds: string[]): Promise<{ unassigned: number }> {
  const result = await this.deviceRepository.update(
    { id: In(deviceIds), gatewayId },
    { gatewayId: null },
  );

  this.eventEmitter.emit('gateway.devices.changed', { gatewayId });
  return { unassigned: result.affected || 0 };
}

async findDevicesByGateway(gatewayId: string): Promise<Device[]> {
  return this.deviceRepository.find({ where: { gatewayId } });
}
```

Needs: `import { In } from 'typeorm'` and `@InjectRepository(Device) private readonly deviceRepository: Repository<Device>`.

GatewayModule already imports DeviceModule — need to verify Device repo is accessible. May need to inject via DeviceModule export or add `TypeOrmModule.forFeature([Device])` to GatewayModule imports.

### 5. Add controller endpoints

File: `src/gateway/gateway.controller.ts`

```typescript
@Post('gateways/:id/devices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async assignDevices(@Param('id') id: string, @Body() dto: AssignDevicesDto) {
  return this.gatewayService.assignDevices(id, dto.deviceIds);
}

@Delete('gateways/:id/devices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async unassignDevices(@Param('id') id: string, @Body() dto: AssignDevicesDto) {
  return this.gatewayService.unassignDevices(id, dto.deviceIds);
}

@Get('gateways/:id/devices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async findDevicesByGateway(@Param('id') id: string) {
  return this.gatewayService.findDevicesByGateway(id);
}
```

### 6. Ensure Device repository accessible in GatewayModule

Check if `DeviceModule` exports `TypeOrmModule`. If not, add `TypeOrmModule.forFeature([Device])` to `GatewayModule` imports.

### 7. Compile check

```bash
yarn build
```

## Todo

- [x] Add `@ManyToOne Gateway` relation to `device.entity.ts`
- [x] Add `@OneToMany Device` relation to `gateway.entity.ts`
- [x] Create `assign-devices.dto.ts`
- [x] Add `assignDevices()`, `unassignDevices()`, `findDevicesByGateway()` to `gateway.service.ts`
- [x] Inject Device repository in GatewayService
- [x] Add 3 endpoints to `gateway.controller.ts`
- [x] Compile check: `yarn build`

## Success Criteria

- `POST /gateways/:id/devices` assigns devices (same farm only)
- `DELETE /gateways/:id/devices` unassigns devices
- `GET /gateways/:id/devices` returns device list
- Cross-farm assignment rejected with 400
- DB schema auto-syncs (TypeORM synchronize:true)

## Risk

- Circular dependency Device↔Gateway — mitigated with string-based relation (same pattern as Zone)
- Device repository in GatewayService — may need to add `TypeOrmModule.forFeature([Device])` to GatewayModule
