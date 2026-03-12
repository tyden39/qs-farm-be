---
phase: 1
status: completed
priority: high
effort: 30min
completed: 2026-03-11
---

# Phase 1: DeviceGateway — Farm Room Support

## Context
- [plan.md](plan.md)
- [temp.md analysis](../reports/temp.md) — Option A
- File: `src/device/websocket/device.gateway.ts`

## Overview
Add `farm:{farmId}` room support to DeviceGateway. Mobile subscribes once per farm instead of N times per device. Also add `isUserConnected()` utility for Phase 3.

## Key Insights
- Socket.IO `server.to([room1, room2]).emit()` sends to UNION of sockets — each socket receives once even if in both rooms
- `connectedClients: Map<socketId, userId>` already exists — `isUserConnected` is a simple lookup
- No DB access needed in gateway — callers pass farmId

## Architecture

```
Before:  device:{deviceId} rooms only
After:   device:{deviceId} + farm:{farmId} rooms

Mobile options:
  A) subscribeToFarm(farmId)   → joins farm:{farmId} → receives ALL device events
  B) subscribeToDevice(deviceId) → joins device:{deviceId} → receives ONE device events
  Both can coexist.
```

## Related Code Files
- **Modify:** `src/device/websocket/device.gateway.ts`

## Implementation Steps

### 1. Add `subscribeToFarm` handler
```typescript
@SubscribeMessage('subscribeToFarm')
handleSubscribeToFarm(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { farmId: string },
) {
  const { farmId } = data;
  const room = `farm:${farmId}`;
  client.join(room);
  this.logger.log(`Client ${client.id} subscribed to farm ${farmId}`);
  return { event: 'subscribed', data: { farmId, room } };
}
```

### 2. Add `unsubscribeFromFarm` handler
```typescript
@SubscribeMessage('unsubscribeFromFarm')
handleUnsubscribeFromFarm(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { farmId: string },
) {
  const { farmId } = data;
  client.leave(`farm:${farmId}`);
  this.logger.log(`Client ${client.id} unsubscribed from farm ${farmId}`);
  return { event: 'unsubscribed', data: { farmId } };
}
```

### 3. Modify `broadcastDeviceData` — accept optional farmId
```typescript
broadcastDeviceData(deviceId: string, data: any, farmId?: string) {
  const payload = { deviceId, data, timestamp: new Date().toISOString() };
  const rooms = [`device:${deviceId}`];
  if (farmId) rooms.push(`farm:${farmId}`);
  this.server.to(rooms).emit('deviceData', payload);
  this.logger.debug(`Broadcasted data to ${rooms.join(', ')}`);
}
```

### 4. Modify `broadcastDeviceStatus` — accept optional farmId
Same pattern as step 3 for `broadcastDeviceStatus`.

### 5. Add `broadcastToFarm` method
```typescript
broadcastToFarm(farmId: string, event: string, data: any) {
  this.server.to(`farm:${farmId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
```

### 6. Add `isUserConnected` method
```typescript
isUserConnected(userId: string): boolean {
  return Array.from(this.connectedClients.values()).includes(userId);
}
```

## Todo List
- [x] Add `subscribeToFarm` handler
- [x] Add `unsubscribeFromFarm` handler
- [x] Modify `broadcastDeviceData` to support farm room
- [x] Modify `broadcastDeviceStatus` to support farm room
- [x] Add `broadcastToFarm` method
- [x] Add `isUserConnected` method
- [x] Verify `yarn build` compiles

## Success Criteria
- Gateway accepts `subscribeToFarm` / `unsubscribeFromFarm` events
- Broadcast methods emit to both device and farm rooms when farmId provided
- No duplicate delivery when client is in both rooms (Socket.IO handles this)
- `isUserConnected(userId)` returns correct boolean

## Risk Assessment
- **Low risk:** Additive changes only, existing `subscribeToDevice` flow unchanged
- **Backward compatible:** farmId parameter is optional, existing callers work as before
