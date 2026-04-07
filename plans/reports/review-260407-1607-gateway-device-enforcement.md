# Code Review: Gateway-Device Enforcement
Date: 2026-04-07 | Reviewer: code-reviewer

## Scope
Files: device.entity.ts, gateway.entity.ts, assign-devices.dto.ts, gateway.module.ts, gateway.service.ts, gateway.controller.ts, emqx.service.ts, mqtt.service.ts

---

## Critical Issues

### 1. Authorization bypass — any authenticated user can assign/unassign devices across farms (HIGH SEVERITY)
**File:** `gateway.controller.ts`, `gateway.service.ts`

`assignDevices()` fetches the gateway by ID (404 if missing) then filters devices by `farmId: gateway.farmId`. It never checks whether the calling user owns that gateway's farm. An attacker who knows a `gatewayId` UUID can POST `gateways/:id/devices` to reparent any device in that farm to a gateway they don't own — or call `GET gateways/:id/devices` to enumerate device IDs across farms.

Fix: inject the authenticated user, load their farm IDs, and assert `gateway.farmId` is in that set before proceeding.

### 2. Authorization bypass — `findByFarm` has no ownership check
**File:** `gateway.controller.ts:23`

`GET /gateways?farmId=<any>` returns all gateways for that farm with no proof the caller owns it. An attacker can probe arbitrary farm UUIDs.

Fix: assert caller owns `farmId` before returning results.

### 3. ACL wildcard subscribe grants over-broad gateway access
**File:** `emqx.service.ts:172`

```ts
if (deviceId === '+') return true;
```

A gateway can subscribe to `device/+/cmd`, receiving commands meant for every device on the broker — not just its own. This leaks cross-farm command traffic. The wildcard path must also verify the gateway's assigned device set (impossible by design), so the correct fix is to **deny wildcard subscriptions for device topics** and require the gateway to subscribe per-device after discovery.

### 4. Deprecated TypeORM `findOne(id)` call
**File:** `emqx.service.ts:220, 265`

```ts
this.deviceRepository.findOne(cleanDeviceId as any)
this.deviceRepository.findOne(deviceId as any, { relations: ['farm'] })
```

TypeORM ≥0.3 dropped positional-id overload. These silently return `undefined` in newer versions, causing every device ACL check to deny. Should be `findOne({ where: { id: ... }, relations: [...] })`.

---

## High Priority

### 5. `assignDevices` silently ignores devices from other farms instead of rejecting
**File:** `gateway.service.ts:150-164`

If all requested `deviceIds` belong to a different farm, `devices.length === 0` throws "No valid devices found". But if the request is mixed (some valid, some cross-farm), the cross-farm devices are silently dropped and the response claims success with `assigned: N`. The caller has no way to know which IDs were skipped.

Fix: return the list of invalid IDs or throw 400 if any device falls outside the farm.

### 6. Race condition in auto-discovery
**File:** `gateway.service.ts:200-218`

Two gateways reporting the same serial concurrently both pass the `!d.gatewayId` filter, then both issue `UPDATE`. The second write wins silently, leaving the device assigned to a different gateway than the first gateway believes. No lock or upsert prevents this.

Fix: use a single atomic `UPDATE devices SET gatewayId=$1 WHERE serial = ANY($2) AND farmId=$3 AND (gatewayId IS NULL OR gatewayId=$1)` via QueryBuilder to avoid the read-modify-write gap.

### 7. `pairGateway` leaks `mqttToken` via MQTT on stale nonce
**File:** `gateway.service.ts:105`

After a token is already used, a re-pair generates a fresh `mqttToken` and publishes it to `provision/gateway/resp/${gateway.nonce}`. If the gateway reconnects with the same nonce, the old (replayed) nonce receives new credentials. The nonce should be cleared after first use.

---

## Medium Priority

### 8. `AssignDevicesDto` missing `@IsNotEmpty` / min-length guard
No lower bound on `deviceIds`. An empty array `[]` passes validation, hits the DB, finds nothing, and throws a confusing "No valid devices" error instead of a clear 400.

### 9. `unassignDevices` does not verify gateway ownership
`DELETE gateways/:id/devices` calls `deviceRepository.update({ id: In(...), gatewayId })` — the ownership check is implicit (only updates rows where `gatewayId` matches). This is safe for the DB write but still allows any authenticated user to poll which devices are assigned to an arbitrary gateway by observing `unassigned: 0` vs `unassigned: N` responses.

### 10. In-memory ACL cache not shared across instances
`gatewayDeviceCache` is per-process. In a multi-replica deployment, `gateway.devices.changed` invalidates only the local instance cache. The other replica serves stale ACL for up to 60 s. Acceptable for now only if single-instance; must be noted as a scaling constraint.

---

## Low Priority

- `device.entity.ts:73` — gateway relation typed as `any`; should be `import type { Gateway }` (circular-safe with string ref already used on line 71)
- `gateway.entity.ts:70` — same `any[]` typing for `devices`
- `GatewayModule` exports `TypeOrmModule` — exposes the `Device` repository globally; should export only `GatewayService`

---

## Unresolved Questions

1. Is the deployment single-instance? If multi-replica, the in-memory ACL cache needs Redis or a DB-backed solution.
2. Should auto-discovery (`handleDevicesReported`) be opt-in per gateway or enabled globally? Currently any paired gateway can silently steal unowned devices.
3. Is EMQX configured to call `/acl` on every publish/subscribe, or only at connect time? If only at connect, the cache TTL is irrelevant.
