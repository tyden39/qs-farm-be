# Phase 2: Event & Sync Integration

**Status:** ⬜ Todo
**Priority:** High
**Effort:** Medium
**Blocked by:** Phase 1

## Context Links

- `src/device/sync/sync.service.ts` — MQTT telemetry handler
- `src/pump/pump.service.ts` — pump.started event handler

## Overview

Cập nhật luồng sự kiện để truyền `operationMode` từ telemetry → event → session.

## Related Code Files

**Modify:**
- `src/device/sync/sync.service.ts` — extract `mode` from telemetry payload
- `src/pump/pump.service.ts` — save `operationMode` when creating session

## Implementation Steps

### 1. Update SyncService — extract mode from telemetry

Trong method xử lý telemetry khi `pumpStatus === 1`, bổ sung extract `mode`:

```typescript
// Trong handleTelemetry khi pumpStatus: 1
const operationMode = payload.mode as PumpOperationMode | undefined;

this.eventEmitter.emit('pump.started', {
  deviceId,
  sessionId: payload.sessionId ?? null,
  operationMode: operationMode ?? PumpOperationMode.NORMAL,
});
```

### 2. Update `pump.started` event payload type

Cập nhật interface/type cho event payload:

```typescript
interface PumpStartedPayload {
  deviceId: string;
  sessionId: string | null;
  operationMode: PumpOperationMode;
}
```

### 3. Update PumpService — save mode to session

Trong `@OnEvent('pump.started')`:

```typescript
const session = this.pumpSessionRepo.create({
  deviceId,
  sessionNumber,
  startedAt: new Date(),
  operationMode: payload.operationMode ?? PumpOperationMode.NORMAL,
  status: PumpSessionStatus.ACTIVE,
});
```

### 4. Validate unknown mode values

Nếu ESP gửi mode không hợp lệ, fallback về `NORMAL`:

```typescript
const validModes = Object.values(PumpOperationMode);
const operationMode = validModes.includes(payload.mode)
  ? payload.mode
  : PumpOperationMode.NORMAL;
```

## MQTT Payload Contract

**ESP → Server (telemetry, pump on):**
```json
{
  "pumpStatus": 1,
  "mode": "drip",
  "sessionId": null
}
```

**Server → ESP (command):**
```json
{
  "command": "pump_on",
  "mode": "drip"
}
```

## Todo

- [ ] Update `sync.service.ts` to extract `mode` from telemetry
- [ ] Update event payload interface with `operationMode`
- [ ] Update `pump.service.ts` `@OnEvent('pump.started')` to save mode
- [ ] Add fallback to `NORMAL` for invalid/missing mode
- [ ] Run `yarn build` to verify no compile errors

## Success Criteria

- Pump session created with correct `operationMode` from telemetry
- Missing/invalid mode falls back to `NORMAL`
- Build passes with no errors
