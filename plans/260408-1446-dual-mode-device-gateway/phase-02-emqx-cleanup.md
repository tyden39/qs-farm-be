# Phase 02 — EMQX Cleanup

**Status:** pending
**Priority:** high

## Overview

Remove the direct-connect block in `authenticate()` (enables dual-mode WiFi). Clean up 3 stale topics from `checkGatewayAcl()`.

## Context Links

- `src/emqx/emqx.service.ts` — `authenticate()` (line 37), `checkGatewayAcl()` (line 138)

## Implementation Steps

### 1. `authenticate()` — remove direct-connect block

Delete lines 65–69:
```typescript
// REMOVE THIS BLOCK:
if (device.gatewayId) {
  this.logger.warn(`Device ${username} blocked: must connect through gateway ${device.gatewayId}`);
  return false;
}
```

After removal, any device with valid `deviceToken` and non-DISABLED status can connect directly.

### 2. `checkGatewayAcl()` — remove 3 stale topics

**Remove from PUBLISH block (access === 2):**
```typescript
// REMOVE:
if (topic === 'provision/new') return true;
// REMOVE:
if (topic === `gateway/${gwId}/devices/report`) return true;
```

**Remove from SUBSCRIBE block (access === 1):**
```typescript
// REMOVE:
if (topic.startsWith('provision/resp/')) return true;
```

**Keep (not touching):**
- `provision/gateway/new` publish — still needed for gateway self-provisioning
- `provision/gateway/resp/+` subscribe — still needed for gateway provisioning response
- All device/* pub/sub rules
- `gateway/{self}/status`, `gateway/{self}/ota`, `gateway/{self}/device-ota`

## Related Code Files

**Modify:**
- `src/emqx/emqx.service.ts`

## Todo

- [ ] Remove `if (device.gatewayId)` block from `authenticate()`
- [ ] Remove `provision/new` from gateway PUBLISH ACL
- [ ] Remove `gateway/{gwId}/devices/report` from gateway PUBLISH ACL
- [ ] Remove `provision/resp/+` from gateway SUBSCRIBE ACL
- [ ] Compile check: `yarn build`

## Success Criteria

- Device with `gatewayId` set can still authenticate directly via MQTT
- Gateway cannot publish to `provision/new` or `gateway/{id}/devices/report`
- Gateway cannot subscribe to `provision/resp/+`
- Gateway provisioning topics (`provision/gateway/*`) unaffected
