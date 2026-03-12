---
status: completed
created: 2026-03-11
completed: 2026-03-11
branch: master
---

# Farm-Level WebSocket Room + Conditional FCM

## Context
- Source: `plans/reports/temp.md` (Option A + Issue 3)
- Goal: Add `farm:{farmId}` WebSocket room for multi-device subscriptions + send FCM only when user offline

## Phases

| # | Phase | Files | Status | Effort |
|---|-------|-------|--------|--------|
| 1 | DeviceGateway farm room support | `device.gateway.ts` | completed | 30min |
| 2 | SyncService farmId cache + farm broadcasts | `sync.service.ts`, `sensor.service.ts` | completed | 45min |
| 3 | Conditional FCM (skip when WS connected) | `threshold.service.ts`, `schedule.service.ts` | completed | 30min |

## Dependency Graph

```
Phase 1 ──→ Phase 2 ──→ Phase 3
              │
              └──→ (also fixes DB Issue 3: 120 queries/min saved)
```

Phase 2 depends on Phase 1 (new gateway methods).
Phase 3 depends on Phase 1 (`isUserConnected` method).
Phases 2 and 3 are independent of each other after Phase 1.

## Key Design Decisions

1. **Farm room = parallel to device room** — mobile subscribes once per farm, receives all device events
2. **Socket.IO multi-room emit** — `server.to([deviceRoom, farmRoom]).emit()` avoids duplicate delivery
3. **FarmId cache in SyncService** — lazy cache with 60s TTL, same pattern as SensorService config cache
4. **Pass farmId through telemetry event** — eliminates SensorService's redundant Device query (DB Issue 3)
5. **Server-side FCM gating** — check WS connection before sending FCM, no mobile changes needed

## Files Modified

- `src/device/websocket/device.gateway.ts` — farm room handlers + `isUserConnected()`
- `src/device/sync/sync.service.ts` — farmId cache + farm-level broadcasts
- `src/sensor/sensor.service.ts` — use farmId from event (remove Device query)
- `src/sensor/threshold.service.ts` — conditional FCM
- `src/schedule/schedule.service.ts` — conditional FCM

## Success Criteria

- [x] Mobile can `subscribeToFarm(farmId)` and receive all device events in that farm
- [x] Existing `subscribeToDevice` still works (backward compatible)
- [x] No duplicate events for clients in both device + farm rooms
- [x] FCM only sent when user has no active WebSocket connection
- [x] SensorService no longer queries Device on every telemetry event
- [x] `yarn build` compiles without errors

## Implementation Command

```
/ck:cook --auto /home/duc/workspace/qs-farm/plans/260311-0642-farm-room-fcm-optimization/plan.md
```
