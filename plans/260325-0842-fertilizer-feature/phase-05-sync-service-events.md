---
phase: 5
title: "SyncService Fertilizer Events"
status: pending
priority: P1
---

# Phase 5: Update SyncService to Emit Fertilizer Events

## Overview

Add fertilizer status detection in `handleDeviceTelemetry()` and LWT handling in `handleDeviceStatus()`.

## File to Modify

- `src/device/sync/sync.service.ts`

## Implementation Steps

### 1. Add fertilizer events to `handleDeviceTelemetry()`

After the existing pump status block (lines 177-194), add:

```typescript
// Fertilizer status events
if (payload.fertStatus !== undefined) {
  if (payload.fertStatus === 1) {
    this.eventEmitter.emit('fertilizer.started', {
      deviceId,
      farmId,
      timestamp,
      controlMode: payload.controlMode || undefined,
    });
  } else if (payload.fertStatus === 0) {
    this.eventEmitter.emit('fertilizer.stopped', {
      deviceId,
      farmId,
      sessionId: payload.fertSessionId || null,
      timestamp,
    });
  }
}
```

### 2. Add fertilizer disconnect to `handleDeviceStatus()`

After the existing LWT pump.disconnected emit (line 140-145), add:

```typescript
// Also emit fertilizer.disconnected on LWT
this.eventEmitter.emit('fertilizer.disconnected', {
  deviceId,
  farmId,
  timestamp,
});
```

LWT means device went offline entirely, so both pump AND fertilizer sessions should be closed.

### 3. Session ID publishing

The `FertilizerService.publishSessionId()` method publishes to `device/{deviceId}/fert-session` (different topic than pump's `device/{deviceId}/session`). No SyncService change needed for this.

## Notes

- ESP sends `fertStatus` alongside `pumpStatus` in the same telemetry payload
- ESP sends `fertSessionId` on stop (same pattern as `sessionId` for pump)
- `controlMode` in payload applies to whichever subsystem triggered the telemetry
- The existing `telemetry.received` event already fires for all payload keys, so SensorService will store FERT_* readings automatically via Phase 1 sensor type mappings

## Success Criteria

- [ ] `fertilizer.started` emitted when `fertStatus === 1`
- [ ] `fertilizer.stopped` emitted when `fertStatus === 0`
- [ ] `fertilizer.disconnected` emitted on LWT (alongside pump.disconnected)
- [ ] Project compiles
