# Code Review: Farm-Level WebSocket Room + Conditional FCM

## Scope
- Files: 7 changed (+194 / -59 lines)
- LOC reviewed: 1,696
- Focus: correctness, backward compatibility, Socket.IO room semantics, cache consistency, memory leaks

## Overall Assessment

Solid feature implementation. The farm-level room broadcasting and conditional FCM logic are well-structured. The caching pattern is consistent with existing codebase conventions. However, there are several edge cases that need attention, one of which is **high priority** (duplicate messages).

---

## Critical Issues

None.

---

## High Priority

### 1. Duplicate messages for clients subscribed to BOTH device and farm rooms

**File:** `device.gateway.ts` lines 211-216, 222-227

When `broadcastDeviceData` / `broadcastDeviceStatus` emit to `[device:X, farm:Y]`, a client subscribed to **both** `device:X` and `farm:Y` will receive the same event **twice**. Socket.IO's `.to(rooms)` is a union of sockets, but if a socket is in multiple matching rooms, it still receives only once per `.to()` call.

**Correction:** Actually, Socket.IO `.to([room1, room2])` performs a union -- each socket receives the message only once even if it is in both rooms. This is correct behavior in Socket.IO v4+. **No issue here after verification.** Disregard.

### 2. `handleDeviceResponse` does not pass `farmId` to broadcasts

**File:** `sync.service.ts` lines 141-169

`handleDeviceResponse` calls `broadcastDeviceStatus(deviceId, {...})` without `farmId`. This means command responses (including OTA_UPDATE results) are NOT broadcast to farm-room subscribers.

**Impact:** Mobile clients relying on farm-level subscriptions will miss command response and OTA status events.

**Fix:**
```typescript
private async handleDeviceResponse(message: MqttMessage) {
  const { deviceId, topic, payload, timestamp } = message;
  const farmId = await this.getFarmId(deviceId);

  this.deviceGateway.broadcastDeviceStatus(deviceId, {
    type: 'commandResponse',
    ...payload,
    receivedAt: timestamp,
  }, farmId);
  // ... rest unchanged
}
```

### 3. `sendCommandToDevice` does not pass `farmId` to broadcasts

**File:** `sync.service.ts` lines 174-218

Both `commandSent` and `commandFailed` broadcasts call `broadcastDeviceStatus` without `farmId`. Same gap as above.

### 4. `threshold.service.ts` alert broadcast at line 228 missing `farmId`

**File:** `threshold.service.ts` line 228

```typescript
this.deviceGateway.broadcastDeviceData(deviceId, { type: 'alert', ... });
```

This broadcasts the alert to `device:X` room only, not the farm room. The FCM notification was conditionally skipped because the user is online (subscribed to farm room), but the WebSocket alert never reaches the farm room.

**Impact:** If user is subscribed to `farm:Y` (not `device:X`), they are considered "online" so FCM is skipped, but they also never receive the alert via WebSocket. **Silent alert loss.**

**Fix:** Pass `farmId` to `broadcastDeviceData` on line 228, and also to the `command_dispatched` broadcast on line 127.

---

## Medium Priority

### 5. No authorization on `subscribeToFarm` / `unsubscribeFromFarm`

**File:** `device.gateway.ts` lines 182-206

Any authenticated WebSocket client can subscribe to any farm room by passing an arbitrary `farmId`. There is no check that the user owns or has access to the farm.

**Impact:** Information disclosure -- a user could receive telemetry/status for farms they do not own.

**Fix:** Validate that `client.data.userId` matches `farm.userId` before joining the room:
```typescript
@SubscribeMessage('subscribeToFarm')
async handleSubscribeToFarm(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { farmId: string },
) {
  const { farmId } = data;
  const farm = await this.farmRepo.findOne({ where: { id: farmId } });
  if (!farm || farm.userId !== client.data.userId) {
    return { event: 'error', data: { message: 'Unauthorized' } };
  }
  client.join(`farm:${farmId}`);
  return { event: 'subscribed', data: { farmId } };
}
```

Note: This requires injecting `Farm` repository into `DeviceGateway` or using a service method.

### 6. Unbounded cache growth (memory leak)

**Files:**
- `sync.service.ts` -- `farmIdCache` grows per unique `deviceId`, never pruned
- `threshold.service.ts` -- `farmOwnerCache` grows per unique `farmId`, never pruned
- `schedule.service.ts` -- `farmOwnerCache` same

For a small IoT deployment this is fine, but if device count grows (hundreds+), stale entries accumulate indefinitely.

**Fix (low-effort):** Add a periodic cleanup or cap the map size:
```typescript
// In a @Interval(300_000) or similar
private pruneCache() {
  const now = Date.now();
  for (const [key, entry] of this.farmIdCache) {
    if (now - entry.loadedAt > this.FARM_CACHE_TTL) {
      this.farmIdCache.delete(key);
    }
  }
}
```

### 7. Duplicated `getFarmOwnerId` implementation

**Files:** `threshold.service.ts` lines 51-63 and `schedule.service.ts` lines 44-56

Identical method + cache + TTL constant duplicated across two services. Violates DRY.

**Fix:** Extract to a shared `FarmService` or utility, or add `getFarmOwnerId(farmId)` to the existing `FarmService` if one exists, with built-in caching.

### 8. `isUserConnected` is O(n) per call

**File:** `device.gateway.ts` line 244

```typescript
return Array.from(this.connectedClients.values()).includes(userId);
```

This iterates all connected clients on every telemetry event and threshold evaluation. With many concurrent WebSocket connections, this becomes a bottleneck.

**Fix:** Maintain a reverse map `userId -> Set<socketId>`:
```typescript
private userSockets: Map<string, Set<string>> = new Map();

// In handleConnection:
const sockets = this.userSockets.get(userId) || new Set();
sockets.add(client.id);
this.userSockets.set(userId, sockets);

// In handleDisconnect:
this.userSockets.get(userId)?.delete(client.id);

isUserConnected(userId: string): boolean {
  return (this.userSockets.get(userId)?.size ?? 0) > 0;
}
```

---

## Low Priority

### 9. `farmId` on `TelemetryEvent` typed as optional but `evaluate()` expects required `farmId: string`

**File:** `sensor.service.ts` line 30 vs `threshold.service.ts` line 66

`TelemetryEvent.farmId` is `string | undefined`, but `ThresholdService.evaluate(deviceId, farmId, ...)` has parameter typed as `farmId: string`. When `farmId` is `undefined`, TypeScript may not catch this depending on strict settings, and the threshold evaluation will pass `undefined` as a string.

**Impact:** The FCM `if (farmId)` guard prevents crashes, but the semantic mismatch could cause confusion.

### 10. `handleDeviceStatus` and `handleDeviceTelemetry` are now async but return values are not awaited by MQTT subscriber

**File:** `sync.service.ts` lines 46-52

The MQTT `onMessage` callbacks are:
```typescript
this.mqttService.onMessage('device/+/status', (message) => {
  this.handleDeviceStatus(message); // Promise not awaited
});
```

The returned Promise is silently dropped. If `getFarmId` throws (e.g., DB connection issue), the error is unhandled.

**Fix:** Either `await` in an async callback or add `.catch()`:
```typescript
this.mqttService.onMessage('device/+/status', (message) => {
  this.handleDeviceStatus(message).catch((err) =>
    this.logger.error('handleDeviceStatus failed:', err),
  );
});
```

---

## Positive Observations

- Cache TTL pattern is consistent with existing `configCache` in `SensorService`
- Backward compatible: `farmId` parameter is optional, existing device-level subscriptions unaffected
- Clean separation -- `SyncService` resolves `farmId` once and passes through events, eliminating the redundant DB query in `SensorService`
- Conditional FCM logic is straightforward and easy to reason about

---

## Recommended Actions (priority order)

1. **[HIGH]** Pass `farmId` to ALL `broadcastDeviceStatus` / `broadcastDeviceData` calls in `sync.service.ts` and `threshold.service.ts` (issues #2, #3, #4) -- otherwise farm-room subscribers miss events and alerts can be silently lost
2. **[MEDIUM]** Add authorization to `subscribeToFarm` handler (issue #5) -- prevents cross-tenant data leakage
3. **[MEDIUM]** Add `.catch()` to unhandled async MQTT callbacks (issue #10) -- prevents silent failures
4. **[MEDIUM]** Add reverse userId map for O(1) `isUserConnected` (issue #8)
5. **[LOW]** Extract `getFarmOwnerId` to shared service (issue #7)
6. **[LOW]** Add cache pruning (issue #6)
7. **[LOW]** Align `farmId` types (issue #9)

---

## Metrics

- Type Coverage: Good (interfaces defined, optional types used)
- Test Coverage: Not assessed (no test changes in diff)
- Linting Issues: 0 (build passes)

## Unresolved Questions

1. Should `subscribeToDevice` also have authorization (verify user owns the device's farm)? Currently it has the same gap as `subscribeToFarm`.
2. Is `broadcastToFarm` (line 233) used anywhere? It was added but has no callers in the diff -- dead code?
3. For the conditional FCM: if a user has the mobile app open but is viewing a different farm, they are "connected" and FCM is skipped. Is this the intended behavior, or should FCM only be skipped when subscribed to the specific farm room?
