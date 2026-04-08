# Phase 03 — Remove Device-Report Flow + Manual Assign Endpoints

**Status:** pending
**Priority:** medium

## Overview

Remove the gateway auto-discovery flow (device report via MQTT → event → handler). Also remove manual assign/unassign endpoints — bidirectional auto-assign at pair time replaces both.

## Context Links

- `src/gateway/gateway.service.ts` — `handleDevicesReported()` (line 186)
- `src/device/mqtt/mqtt.service.ts` — subscription (line 115), event emission (line 151)
- `src/gateway/gateway.controller.ts` — `assignDevices()`, `unassignDevices()` endpoints

## Implementation Steps

### 1. `GatewayService` — remove `handleDevicesReported()`

Delete the entire method (lines 186–228):
```typescript
// REMOVE:
@OnEvent('gateway.devices.reported')
async handleDevicesReported(...) { ... }
```

If `@nestjs/event-emitter` `@OnEvent` decorator is only used here in this file, the import can be cleaned up.

### 2. `MqttService` — remove `gateway/+/devices/report` subscription

Delete subscription block (line ~115):
```typescript
// REMOVE:
this.client.subscribe('gateway/+/devices/report', (err) => { ... });
```

Delete event emission in message handler (line ~151):
```typescript
// REMOVE:
if (topic.match(/^gateway\/[^/]+\/devices\/report$/)) {
  const gatewayId = topic.split('/')[1];
  this.eventEmitter.emit('gateway.devices.reported', { gatewayId, payload });
  return;
}
```

### 3. `GatewayController` — remove manual assign/unassign endpoints

Remove:
- `POST /gateways/:id/devices` → `assignDevices()` handler
- `DELETE /gateways/:id/devices` → `unassignDevices()` handler

Remove corresponding methods in `GatewayService`:
- `assignDevices()`
- `unassignDevices()`

Remove associated DTOs if only used by these endpoints.

## Related Code Files

**Modify:**
- `src/gateway/gateway.service.ts`
- `src/gateway/gateway.controller.ts`
- `src/device/mqtt/mqtt.service.ts`

**Possibly delete (check usage):**
- DTOs for assign/unassign if unused elsewhere

## Todo

- [ ] Remove `handleDevicesReported()` from `gateway.service.ts`
- [ ] Clean up unused `@OnEvent` import in `gateway.service.ts` if applicable
- [ ] Remove `gateway/+/devices/report` subscription from `mqtt.service.ts`
- [ ] Remove `gateway.devices.reported` event emission from `mqtt.service.ts`
- [ ] Remove `assignDevices()` + `unassignDevices()` from `gateway.controller.ts`
- [ ] Remove `assignDevices()` + `unassignDevices()` from `gateway.service.ts`
- [ ] Remove orphaned DTOs if any
- [ ] Compile check: `yarn build`

## Success Criteria

- No `gateway/+/devices/report` subscription in MqttService
- No `gateway.devices.reported` event emitted or handled
- `POST /gateways/:id/devices` and `DELETE /gateways/:id/devices` return 404
- Build passes with no unused import warnings
