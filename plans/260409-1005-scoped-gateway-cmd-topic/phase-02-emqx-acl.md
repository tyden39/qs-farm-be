# Phase 02 — EMQX ACL Update

## Overview

- **Priority:** P1
- **Status:** pending
- **Effort:** 30min
- **Depends on:** Phase 01 (server must publish new topic before gateway switches subscription)

Update `checkGatewayAcl()` subscribe logic: remove `device/+/cmd` wildcard, replace with scoped `gateway/{gwId}/device/+/cmd`.

## Change

**File:** `src/emqx/emqx.service.ts` — `checkGatewayAcl()` subscribe block

### Before (lines ~162-170)

```ts
if (topic.startsWith('device/')) {
  const parts = topic.split('/');
  const deviceId = parts[1];
  // Gateway subscribes device/+/cmd to receive commands for all its devices
  if (deviceId === '+' && parts[2] === 'cmd') return true;  // ← wildcard, no ownership check
  if (deviceId === '+') return false;
  const deviceIds = await this.getGatewayDeviceIds(gwId);
  return deviceIds.has(deviceId);
}
```

### After

```ts
// Scoped gateway command topic: gateway/{gwId}/device/+/cmd
if (topic === `gateway/${gwId}/device/+/cmd`) return true;

// Legacy: allow subscribe to own-device specific topics (telemetry, resp, status)
if (topic.startsWith('device/')) {
  const parts = topic.split('/');
  const deviceId = parts[1];
  if (deviceId === '+') return false;  // wildcard denied — must use scoped topic
  const deviceIds = await this.getGatewayDeviceIds(gwId);
  return deviceIds.has(deviceId);
}
```

**Key change:** `device/+/cmd` wildcard is now denied. Gateway must subscribe `gateway/{gwId}/device/+/cmd` — EMQX only delivers messages published to that topic prefix.

## Todo

- [ ] Remove `device/+/cmd` wildcard allow in `checkGatewayAcl()` subscribe block
- [ ] Add `gateway/{gwId}/device/+/cmd` allow
- [ ] Run `yarn build` to verify
- [ ] Integration test: verify gateway cannot subscribe `device/+/cmd` anymore

## Success Criteria

- Gateway subscribing `device/+/cmd` → EMQX returns 403
- Gateway subscribing `gateway/{gwId}/device/+/cmd` → EMQX returns 200
- Server publishing `gateway/{gwId}/device/{deviceId}/cmd` reaches gateway (firmware change needed separately)
