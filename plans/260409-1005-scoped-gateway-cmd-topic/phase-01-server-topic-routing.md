# Phase 01 — Server-side Topic Routing

## Overview

- **Priority:** P1
- **Status:** pending
- **Effort:** 1h

Update `publishToDevice()` to route commands through `gateway/{gwId}/device/{deviceId}/cmd` when device has a gatewayId, otherwise keep `device/{deviceId}/cmd`.

## Architecture

```
sendCommandToDevice(deviceId)
  └─ lookup device.gatewayId
       ├─ gatewayId present → publish "gateway/{gwId}/device/{deviceId}/cmd"
       └─ gatewayId null    → publish "device/{deviceId}/cmd"  (WiFi direct)
```

## Implementation Steps

### 1. `src/device/mqtt/mqtt.service.ts` — Add `gatewayId` param

```ts
async publishToDevice(deviceId: string, command: string, data: any, gatewayId?: string | null) {
  const topic = gatewayId
    ? `gateway/${gatewayId}/device/${deviceId}/cmd`
    : `device/${deviceId}/cmd`;
  const payload = { command, data, timestamp: new Date().toISOString() };
  return this.publishToTopic(topic, payload);
}
```

### 2. `src/device/sync/sync.service.ts` — Include `gatewayId` in context cache

`getDeviceIds()` currently returns `{ farmId, zoneId }`. Add `gatewayId`:

```ts
private async getDeviceIds(deviceId: string): Promise<{ farmId: string | null; zoneId: string | null; gatewayId: string | null }> {
  // cache lookup...
  const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
  const entry = {
    farmId: device?.farmId ?? null,
    zoneId: device?.zoneId ?? null,
    gatewayId: device?.gatewayId ?? null,
    loadedAt: Date.now(),
  };
  // ...
}
```

Then in `sendCommandToDevice()`:

```ts
const { farmId, gatewayId } = await this.getDeviceIds(deviceId);
// ...
await this.mqttService.publishToDevice(deviceId, command, params, gatewayId);
```

### 3. `src/sensor/threshold.service.ts` — Inject Device repo, lookup gatewayId

`ThresholdService` doesn't have device access. Inject `Device` repository:

```ts
// constructor:
@InjectRepository(Device)
private readonly deviceRepo: Repository<Device>,
```

Before `publishToDevice()` call (line ~124):

```ts
const device = await this.deviceRepo.findOne({ where: { id: deviceId }, select: ['id', 'gatewayId'] });
await this.mqttService.publishToDevice(deviceId, threshold.action, { ... }, device?.gatewayId);
```

> Note: device object is not available at that call site — must do a DB lookup. Use `select: ['id', 'gatewayId']` to keep it lean.

### 4. `src/device/device.service.ts` — Pass `device.gatewayId` (device already loaded)

`remove()` already has the full `device` object:

```ts
await this.mqttService.publishToDevice(device.id, 'factory_reset', {}, device.gatewayId);
```

Same for `resetDevice()` if it calls `publishToDevice`.

## Files to Modify

- `src/device/mqtt/mqtt.service.ts`
- `src/device/sync/sync.service.ts`
- `src/sensor/threshold.service.ts`
- `src/device/device.service.ts`
- `src/device/sync/sync.service.spec.ts` (update tests)

## Files NOT Modified

- `src/provision/provision.service.ts` — intentionally kept as `device/{id}/cmd` (provisioning = WiFi/direct, PENDING state)

## Todo

- [ ] Update `publishToDevice()` signature in `mqtt.service.ts`
- [ ] Extend `getDeviceIds()` cache to include `gatewayId` in `sync.service.ts`
- [ ] Pass `gatewayId` in `sendCommandToDevice()` call
- [ ] Inject `Device` repo into `ThresholdService`, lookup `gatewayId` before publish
- [ ] Pass `device.gatewayId` in `device.service.ts:remove()`
- [ ] Update `sync.service.spec.ts` — test both WiFi and LoRa topic routing
- [ ] Run `yarn build` to verify no compile errors

## Success Criteria

- `yarn build` passes
- Unit tests cover: `gatewayId=null` → `device/{id}/cmd`, `gatewayId=xyz` → `gateway/xyz/device/{id}/cmd`
