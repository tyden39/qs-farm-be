# Phase 02 — Auth + ACL Enforcement

## Overview

- **Priority:** P1
- **Status:** completed
- **Effort:** 3h
- **Depends on:** Phase 01

2-layer enforcement in `emqx.service.ts`:
1. **Auth layer**: reject direct MQTT connection for devices that have `gatewayId`
2. **ACL layer**: validate gateway only publishes to its own devices (with in-memory cache)

## Key Insights

- Auth check runs once per MQTT connect — zero ongoing cost, strongest enforcement
- ACL check runs per publish/subscribe — needs cache to avoid DB query flood
- `checkGatewayAcl()` currently sync + no DB query — must become async with cached lookup
- Cache invalidated by `gateway.devices.changed` event (emitted by Phase 01 assign/unassign)
- Mixed mode: `gatewayId === null` → direct WiFi allowed, `gatewayId !== null` → blocked

## Related Files

**Modify:**
- `src/emqx/emqx.service.ts` — auth block + ACL ownership + cache

## Implementation Steps

### 1. Add gateway device cache to EmqxService

File: `src/emqx/emqx.service.ts`

```typescript
// In-memory cache: gwId → { deviceIds, expiresAt }
private gatewayDeviceCache = new Map<string, { deviceIds: Set<string>; expiresAt: number }>();
private readonly CACHE_TTL = 60_000; // 60s

private async getGatewayDeviceIds(gatewayId: string): Promise<Set<string>> {
  const cached = this.gatewayDeviceCache.get(gatewayId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.deviceIds;
  }

  const devices = await this.deviceRepository.find({
    where: { gatewayId },
    select: ['id'],
  });

  const deviceIds = new Set(devices.map(d => d.id));
  this.gatewayDeviceCache.set(gatewayId, {
    deviceIds,
    expiresAt: Date.now() + this.CACHE_TTL,
  });

  return deviceIds;
}
```

### 2. Add cache invalidation listener

```typescript
@OnEvent('gateway.devices.changed')
handleGatewayDevicesChanged(data: { gatewayId: string }) {
  this.gatewayDeviceCache.delete(data.gatewayId);
  this.logger.debug(`Cache invalidated for gateway ${data.gatewayId}`);
}
```

Need to add `import { OnEvent } from '@nestjs/event-emitter'`.

### 3. Auth enforcement — block direct device connect

File: `src/emqx/emqx.service.ts` — in `authenticate()`, device auth section.

After token match + status check, before returning `true`:

```typescript
// Block direct connect if device is assigned to a gateway
if (device.gatewayId) {
  this.logger.warn(`Device ${username} blocked: must connect through gateway ${device.gatewayId}`);
  return false;
}

this.logger.log(`Device authenticated: ${username}`);
return true;
```

### 4. ACL enforcement — gateway device ownership

File: `src/emqx/emqx.service.ts` — change `checkGatewayAcl()` from sync to async.

```typescript
private async checkGatewayAcl(username: string, topic: string, access: number): Promise<boolean> {
  const gwId = username.replace('gateway:', '');

  // PUBLISH
  if (access === 2) {
    // Gateway's own topics — no device check needed
    if (topic === `gateway/${gwId}/status`) return true;
    if (topic === 'provision/gateway/new') return true;
    if (topic === `gateway/${gwId}/devices/report`) return true;

    // Device topics — must own the device
    if (topic.startsWith('device/')) {
      const deviceId = topic.split('/')[1];
      const deviceIds = await this.getGatewayDeviceIds(gwId);
      if (!deviceIds.has(deviceId)) {
        this.logger.warn(`Gateway ${gwId} denied publish to ${topic}: device not assigned`);
        return false;
      }
      return true;
    }

    // Provision for devices behind gateway
    if (topic === 'provision/new') return true;

    return false;
  }

  // SUBSCRIBE
  if (access === 1) {
    // Gateway's own topics
    if (topic === `gateway/${gwId}/ota`) return true;
    if (topic === `gateway/${gwId}/device-ota`) return true;

    // Device command topics — must own the device
    if (topic.startsWith('device/')) {
      const deviceId = topic.split('/')[1];
      // Allow wildcard subscribe for device/+/cmd (gateway needs to receive commands for all its devices)
      if (deviceId === '+') return true;
      const deviceIds = await this.getGatewayDeviceIds(gwId);
      return deviceIds.has(deviceId);
    }

    // Provision response topics
    if (topic.startsWith('provision/resp/')) return true;
    if (topic.startsWith('provision/gateway/resp/')) return true;

    return false;
  }

  return false;
}
```

### 5. Update checkAcl() — checkGatewayAcl is now async

The `checkAcl()` method already awaits device/user ACL checks. Update gateway branch:

```typescript
// Was: return this.checkGatewayAcl(username, topic, access);
// Now: already async, just add await
return await this.checkGatewayAcl(username, topic, access);
```

`checkGatewayAcl` was sync returning `boolean`. Now returns `Promise<boolean>`. Since `checkAcl()` already returns `Promise<boolean>`, just adding `await` is sufficient.

### 6. Compile check

```bash
yarn build
```

## Todo

- [x] Add `gatewayDeviceCache` Map + `getGatewayDeviceIds()` method
- [x] Add `@OnEvent('gateway.devices.changed')` cache invalidation
- [x] Auth: block device with `gatewayId` from direct MQTT connect
- [x] ACL: make `checkGatewayAcl()` async with device ownership validation
- [x] Add `await` to `checkGatewayAcl()` call in `checkAcl()`
- [x] Compile check: `yarn build`

## Success Criteria

- Device with `gatewayId` → MQTT auth rejected (cannot connect directly)
- Device without `gatewayId` → MQTT auth allowed (WiFi direct mode)
- Gateway publish `device/{id}/...` for its own device → ACL allows
- Gateway publish `device/{id}/...` for another gateway's device → ACL denies
- Gateway publish `device/{id}/...` for unassigned device → ACL denies
- Cache invalidated when devices assigned/unassigned → next ACL check queries fresh

## Risk

- `checkGatewayAcl()` sync→async: low risk since `checkAcl()` already returns Promise
- Cache stale for 60s max on edge cases where `gateway.devices.changed` event missed → acceptable, devices won't be reassigned frequently
- EMQX webhook timeout: if DB query slow on cache miss, EMQX may timeout → 60s cache TTL keeps misses rare
