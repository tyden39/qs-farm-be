# Phase 01 — Auto-Assign Logic

**Status:** pending
**Priority:** high

## Overview

Add bidirectional auto-assignment of `device.gatewayId` at pair time. When a device is paired it gets the farm's gateway; when a gateway is paired it claims all farm devices. When a gateway is deleted/unpaired, bulk nulls all its devices.

## Context Links

- Brainstorm: [brainstorm-260408-0942-dual-mode-device-gateway.md](../reports/brainstorm-260408-0942-dual-mode-device-gateway.md)
- `src/provision/provision.service.ts` — `pairDevice()` (line 113), `publishSetOwnerCommand()` (line 429)
- `src/gateway/gateway.service.ts` — `pairGateway()` (line 77), `deleteGateway()` (check exists)

## Implementation Steps

### 1. `ProvisionService.pairDevice()` — query + set `gatewayId`

After marking device as paired (line ~170), before calling `publishSetOwnerCommand`:

```typescript
// Find farm gateway (1 farm = max 1 gateway)
const gateway = await this.gatewayRepository.findOne({
  where: { farmId, status: Not(GatewayStatus.DISABLED) },
});
const gatewayId = gateway?.id ?? null;

await this.deviceRepository.update(device.id, {
  farmId,
  deviceToken,
  status: DeviceStatus.PAIRED,
  pairedAt: new Date(),
  gatewayId,   // ← add this
});
```

Pass `gatewayId` into `publishSetOwnerCommand` signature.

### 2. `publishSetOwnerCommand()` — add `gatewayId` to payload

Change signature:
```typescript
private async publishSetOwnerCommand(
  deviceId: string,
  userId: string,
  deviceToken: string,
  farmId: string,
  gatewayId: string | null,   // ← add
)
```

Add to MQTT payload:
```typescript
{
  cmd: 'set_owner',
  ownerId: userId,
  farmId,
  token: deviceToken,
  gatewayId: gatewayId ?? null,   // ← add
  timestamp: new Date().toISOString(),
}
```

Update call site in `pairDevice()` to pass `gatewayId`.

### 3. `GatewayService.pairGateway()` — bulk assign farm devices

After `gateway.save()` (line ~104), add:

```typescript
// Bulk assign all farm devices to this gateway
await this.deviceRepository.update(
  { farmId: dto.farmId, status: Not(DeviceStatus.DISABLED) },
  { gatewayId: gateway.id },
);
this.logger.log(`Gateway ${gateway.id}: bulk assigned farm ${dto.farmId} devices`);
```

Requires injecting `deviceRepository` into `GatewayService` (check if already injected).

### 4. `GatewayService` — bulk null on gateway delete/unpair

Find the delete method. Before deleting the gateway record, add:

```typescript
// Release all assigned devices
await this.deviceRepository.update(
  { gatewayId: gateway.id },
  { gatewayId: null },
);
```

If no delete method exists, check controller for DELETE endpoint and trace to service.

## Related Code Files

**Modify:**
- `src/provision/provision.service.ts`
- `src/gateway/gateway.service.ts`

## Todo

- [ ] Inject `gatewayRepository` into `ProvisionService` if not already present
- [ ] Inject `deviceRepository` into `GatewayService` if not already present
- [ ] Update `pairDevice()` — query gateway + set `gatewayId` in update
- [ ] Update `publishSetOwnerCommand()` — add `gatewayId` param + payload field
- [ ] Update `pairGateway()` — bulk assign farm devices after pair
- [ ] Add bulk null on gateway delete/unpair
- [ ] Compile check: `yarn build`

## Success Criteria

- Pairing a device on a farm that has a gateway → `device.gatewayId` is set
- Pairing a gateway → all existing farm devices get `gatewayId` set
- Deleting/unpairing a gateway → all its devices have `gatewayId = null`
- `set_owner` MQTT payload includes `gatewayId` field
