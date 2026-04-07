# Phase 03 — Auto-Discovery via MQTT

## Overview

- **Priority:** P1
- **Status:** completed
- **Effort:** 2h
- **Depends on:** Phase 01

Gateway LoRa-scans nearby devices, reports serials to server via MQTT. Server auto-assigns matching devices (same farm, already provisioned) to gateway.

## Key Insights

- Gateway publishes `gateway/{gwId}/devices/report` with `{ "devices": ["SERIAL-001", ...] }`
- Server matches serials → Device table, validates `device.farmId === gateway.farmId`
- Only provisioned+paired devices (have farmId) can be assigned
- Gateway may re-report on reconnect — handler must be idempotent
- Devices already assigned to another gateway → skip (don't steal)

## MQTT Flow

```
[Gateway] ──LoRa scan──→ discovers devices by serial
    │
    ├─ MQTT publish: gateway/{gwId}/devices/report
    │   payload: { "devices": ["SN-001", "SN-002", "SN-003"] }
    │
    ▼
[Server] receives → match serials
    ├─ SN-001: found, same farm, no gateway → assign gatewayId ✓
    ├─ SN-002: found, same farm, already this gateway → skip (idempotent)
    ├─ SN-003: found, different farm → skip + warn
    └─ SN-004: not found in DB → skip (not provisioned)
```

## Related Files

**Modify:**
- `src/device/mqtt/mqtt.service.ts` — subscribe `gateway/+/devices/report`, emit event
- `src/gateway/gateway.service.ts` — `@OnEvent('gateway.devices.reported')` handler

## Implementation Steps

### 1. Subscribe discovery topic in MqttService

File: `src/device/mqtt/mqtt.service.ts`

Add to `subscribeToTopics()`:
```typescript
this.client.subscribe('gateway/+/devices/report', (err) => {
  if (err) {
    this.logger.error('Failed to subscribe to gateway/+/devices/report', err);
  } else {
    this.logger.log('Subscribed to gateway/+/devices/report');
  }
});
```

Add to `handleMessage()`, alongside existing gateway event handling:
```typescript
if (topic.match(/^gateway\/[^/]+\/devices\/report$/)) {
  const gatewayId = topic.split('/')[1];
  this.eventEmitter.emit('gateway.devices.reported', { gatewayId, payload });
  return;
}
```

### 2. Add ACL permission for discovery topic

File: `src/emqx/emqx.service.ts` — already handled in Phase 02.

Gateway publish `gateway/{gwId}/devices/report` → already allowed by:
```typescript
if (topic === `gateway/${gwId}/devices/report`) return true;
```

### 3. Handle discovery event in GatewayService

File: `src/gateway/gateway.service.ts`

```typescript
@OnEvent('gateway.devices.reported')
async handleDevicesReported(data: { gatewayId: string; payload: { devices: string[] } }) {
  const { gatewayId, payload } = data;
  const serials = payload.devices;

  if (!Array.isArray(serials) || serials.length === 0) return;

  try {
    const gateway = await this.gatewayRepository.findOne({ where: { id: gatewayId } });
    if (!gateway?.farmId) {
      this.logger.warn(`Gateway ${gatewayId} not paired to farm, ignoring device report`);
      return;
    }

    // Find devices matching serials in same farm, not yet assigned to another gateway
    const devices = await this.deviceRepository.find({
      where: {
        serial: In(serials),
        farmId: gateway.farmId,
      },
    });

    const toAssign = devices.filter(d => !d.gatewayId || d.gatewayId === gatewayId);
    const skipped = devices.filter(d => d.gatewayId && d.gatewayId !== gatewayId);

    if (skipped.length > 0) {
      this.logger.warn(
        `Gateway ${gatewayId}: ${skipped.length} devices already assigned to other gateways`,
      );
    }

    if (toAssign.length === 0) return;

    // Assign only devices not yet assigned to this gateway
    const newAssign = toAssign.filter(d => d.gatewayId !== gatewayId);
    if (newAssign.length > 0) {
      await this.deviceRepository.update(
        { id: In(newAssign.map(d => d.id)) },
        { gatewayId },
      );

      this.eventEmitter.emit('gateway.devices.changed', { gatewayId });
      this.logger.log(
        `Gateway ${gatewayId}: auto-assigned ${newAssign.length} devices [${newAssign.map(d => d.serial).join(', ')}]`,
      );
    }
  } catch (error) {
    this.logger.error(`Gateway device report error: ${error.message}`);
  }
}
```

### 4. Compile check

```bash
yarn build
```

## Todo

- [x] Subscribe `gateway/+/devices/report` in `mqtt.service.ts`
- [x] Emit `gateway.devices.reported` event in `handleMessage()`
- [x] Add `@OnEvent('gateway.devices.reported')` handler in `gateway.service.ts`
- [x] Compile check: `yarn build`

## Success Criteria

- Gateway publishes device serials → matching devices auto-assigned `gatewayId`
- Only same-farm devices assigned
- Devices already on another gateway → skipped (not stolen)
- Re-report is idempotent (no duplicate assignments)
- Cache invalidated after assignment (Phase 02 event)
- Unprovisioned serials → silently ignored

## Risk

- Large device report (100+ serials): `IN()` query fine for TypeORM + Postgres, no issue
- Race condition: two gateways report same device simultaneously → first write wins, second sees `gatewayId !== null` → skips. Acceptable.
