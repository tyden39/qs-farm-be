# Phase 3: Session Lifecycle (Event Handlers)

## Context Links

- [Phase 1: Entity & Enum Setup](./phase-01-entity-enum-setup.md)
- [Phase 2: PumpModule Foundation](./phase-02-pump-module-foundation.md)
- [SyncService](../../src/device/sync/sync.service.ts) -- emit events here
- [SensorService](../../src/sensor/sensor.service.ts) -- @OnEvent pattern reference
- [MqttService](../../src/device/mqtt/mqtt.service.ts) -- publishToTopic for session ID
- [ThresholdService](../../src/sensor/threshold.service.ts) -- AlertLog query reference

## Overview

- **Priority:** P1 (core feature)
- **Status:** completed
- **Description:** Wire SyncService to emit pump events, implement PumpService event handlers for session create/close, session ID handshake via MQTT, and atomic totalOperatingHours update

## Key Insights

- SyncService.handleDeviceTelemetry already emits `telemetry.received`. For pump events, we emit SEPARATE events (`pump.started`, `pump.stopped`) so PumpService can listen without coupling to SensorService.
- ESP telemetry payload includes `pumpStatus: 1` (on) or `pumpStatus: 0` (off). When off, may include `sessionId` field.
- SyncService.handleDeviceStatus receives LWT messages. LWT payload has `reason: "lwt"` -- emit `pump.disconnected`.
- Session ID published to `device/{id}/session` (new topic, not `/cmd`) so ESP knows it's a session assignment.
- `publishToTopic` method on MqttService publishes to arbitrary topics (used for session topic).
- MqttService.subscribeToTopics does NOT subscribe to `device/+/session` -- it's server-to-device only.
- Aggregate queries run on SensorData between session startedAt and endedAt using QueryBuilder.
- Overcurrent detection: query AlertLog for `sensorType = electrical_current` AND `level = critical` during session window.
- `totalOperatingHours` update must be atomic (increment, not set) to handle concurrent session closes.

## Requirements

**Functional:**
- SyncService emits `pump.started` when `pumpStatus === 1` in telemetry
- SyncService emits `pump.stopped` when `pumpStatus === 0` in telemetry (includes sessionId if present)
- SyncService emits `pump.disconnected` when device status has `reason: "lwt"`
- PumpService handles `pump.started`: find or create active session, publish sessionId to ESP
- PumpService handles `pump.stopped` (with sessionId): close as completed, compute aggregates, update totalOperatingHours
- PumpService handles `pump.stopped` (no sessionId): close as interrupted/esp_reboot
- PumpService handles `pump.disconnected`: close as interrupted/lwt with endedAt = last sensor timestamp

**Non-functional:**
- Atomic totalOperatingHours increment via QueryBuilder UPDATE
- Session number auto-incremented per device

## Architecture

### Event Flow

```
ESP telemetry { pumpStatus: 1, temperature: 55, ... }
  |
  v
SyncService.handleDeviceTelemetry()
  |-- emit 'telemetry.received' (existing, for SensorService)
  |-- if payload.pumpStatus === 1: emit 'pump.started'
  |-- if payload.pumpStatus === 0: emit 'pump.stopped'
  v
PumpService @OnEvent('pump.started')
  |-- findOne({ deviceId, status: ACTIVE })
  |-- if exists: reuse (server restart case)
  |-- else: sessionNumber = MAX(sessionNumber) + 1, create new
  |-- publish sessionId to device/{id}/session
  v
PumpService @OnEvent('pump.stopped')
  |-- with sessionId: find by id, close as completed
  |-- without sessionId: find active by deviceId, close as interrupted/esp_reboot
  |-- compute aggregates from SensorData
  |-- compute overcurrent from AlertLog
  |-- if completed: atomic increment Device.totalOperatingHours
```

### Session Integrity Table

| Scenario | status | interruptedReason | totalHours updated? |
|---|---|---|---|
| Normal stop (correct sessionId) | completed | null | YES |
| ESP reboot (no sessionId) | interrupted | esp_reboot | NO |
| ESP crash (LWT) | interrupted | lwt | NO |
| No data >30s (Phase 4 cron) | interrupted | timeout | NO |
| Server restart, pump still running | active (reuse) | -- | -- |

## Related Code Files

**Modify:**
- `src/device/sync/sync.service.ts` -- emit pump events
- `src/pump/pump.service.ts` -- add event handlers

## Implementation Steps

### Step 1: Define event interfaces

Add to top of `src/pump/pump.service.ts` (before the class):

```typescript
export interface PumpStartedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
}

export interface PumpStoppedEvent {
  deviceId: string;
  farmId?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface PumpDisconnectedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
}
```

### Step 2: Modify SyncService to emit pump events

In `src/device/sync/sync.service.ts`, modify `handleDeviceTelemetry()`. After the existing `this.eventEmitter.emit('telemetry.received', ...)` call (line 155-160), add pump event emission:

```typescript
// Pump status events
if (payload.pumpStatus !== undefined) {
  if (payload.pumpStatus === 1) {
    this.eventEmitter.emit('pump.started', {
      deviceId,
      farmId,
      timestamp,
    });
  } else if (payload.pumpStatus === 0) {
    this.eventEmitter.emit('pump.stopped', {
      deviceId,
      farmId,
      sessionId: payload.sessionId || null,
      timestamp,
    });
  }
}
```

### Step 3: Modify SyncService to emit pump.disconnected on LWT

In `src/device/sync/sync.service.ts`, modify `handleDeviceStatus()`. After the existing `broadcastDeviceStatus` call (line 125-132), add:

```typescript
// LWT disconnect detection
if (payload.reason === 'lwt') {
  this.eventEmitter.emit('pump.disconnected', {
    deviceId,
    farmId,
    timestamp,
  });
}
```

### Step 4: Implement pump.started handler in PumpService

Add to `src/pump/pump.service.ts`:

```typescript
import { PumpSessionStatus } from './enums/pump-session-status.enum';
import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';

@OnEvent('pump.started')
async handlePumpStarted(event: PumpStartedEvent) {
  const { deviceId, timestamp } = event;

  try {
    // Check for existing active session (server restart case)
    const existing = await this.pumpSessionRepo.findOne({
      where: { deviceId, status: PumpSessionStatus.ACTIVE },
    });

    if (existing) {
      this.logger.log(
        `Reusing active session ${existing.id} for device ${deviceId}`,
      );
      // Re-publish sessionId to ESP (it may have rebooted)
      await this.publishSessionId(deviceId, existing.id);
      return;
    }

    // Get next session number
    const maxResult = await this.pumpSessionRepo
      .createQueryBuilder('ps')
      .select('MAX(ps.sessionNumber)', 'max')
      .where('ps.deviceId = :deviceId', { deviceId })
      .getRawOne();

    const sessionNumber = (maxResult?.max || 0) + 1;

    // Create new session
    const session = this.pumpSessionRepo.create({
      deviceId,
      sessionNumber,
      startedAt: timestamp,
      status: PumpSessionStatus.ACTIVE,
    });

    const saved = await this.pumpSessionRepo.save(session);

    this.logger.log(
      `Session #${sessionNumber} started for device ${deviceId} (id=${saved.id})`,
    );

    // Publish session ID to ESP
    await this.publishSessionId(deviceId, saved.id);

    // Broadcast to WebSocket
    this.deviceGateway.broadcastDeviceData(
      deviceId,
      {
        type: 'pump_session_started',
        sessionId: saved.id,
        sessionNumber,
      },
      event.farmId,
    );
  } catch (error) {
    this.logger.error(
      `Error handling pump.started for device ${deviceId}:`,
      error,
    );
  }
}

private async publishSessionId(deviceId: string, sessionId: string) {
  try {
    await this.mqttService.publishToTopic(`device/${deviceId}/session`, {
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    this.logger.error(
      `Failed to publish sessionId to device ${deviceId}:`,
      error,
    );
  }
}
```

### Step 5: Implement pump.stopped handler

Add to `src/pump/pump.service.ts`:

```typescript
import { InterruptedReason } from './enums/interrupted-reason.enum';

@OnEvent('pump.stopped')
async handlePumpStopped(event: PumpStoppedEvent) {
  const { deviceId, sessionId, timestamp } = event;

  try {
    let session: PumpSession;

    if (sessionId) {
      // Normal stop -- find by sessionId
      session = await this.pumpSessionRepo.findOne({
        where: { id: sessionId, status: PumpSessionStatus.ACTIVE },
      });

      if (!session) {
        this.logger.warn(
          `No active session found with id=${sessionId} for device ${deviceId}`,
        );
        return;
      }

      await this.closeSession(session, timestamp, PumpSessionStatus.COMPLETED);
    } else {
      // ESP reboot -- no sessionId, find active by deviceId
      session = await this.pumpSessionRepo.findOne({
        where: { deviceId, status: PumpSessionStatus.ACTIVE },
      });

      if (!session) {
        this.logger.debug(
          `No active session for device ${deviceId} on pump.stopped (no sessionId)`,
        );
        return;
      }

      await this.closeSession(
        session,
        timestamp,
        PumpSessionStatus.INTERRUPTED,
        InterruptedReason.ESP_REBOOT,
      );
    }

    // Broadcast to WebSocket
    this.deviceGateway.broadcastDeviceData(
      deviceId,
      {
        type: 'pump_session_ended',
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        status: session.status,
        durationSeconds: session.durationSeconds,
      },
      event.farmId,
    );
  } catch (error) {
    this.logger.error(
      `Error handling pump.stopped for device ${deviceId}:`,
      error,
    );
  }
}
```

### Step 6: Implement pump.disconnected handler (LWT)

Add to `src/pump/pump.service.ts`:

```typescript
@OnEvent('pump.disconnected')
async handlePumpDisconnected(event: PumpDisconnectedEvent) {
  const { deviceId } = event;

  try {
    const session = await this.pumpSessionRepo.findOne({
      where: { deviceId, status: PumpSessionStatus.ACTIVE },
    });

    if (!session) {
      this.logger.debug(
        `No active session for device ${deviceId} on LWT disconnect`,
      );
      return;
    }

    // endedAt = last sensor data timestamp for this device
    const lastData = await this.getLastSensorTimestamp(deviceId);
    const endedAt = lastData || event.timestamp;

    await this.closeSession(
      session,
      endedAt,
      PumpSessionStatus.INTERRUPTED,
      InterruptedReason.LWT,
    );

    this.logger.log(
      `Session ${session.id} closed as LWT for device ${deviceId}`,
    );

    this.deviceGateway.broadcastDeviceData(
      deviceId,
      {
        type: 'pump_session_ended',
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        status: PumpSessionStatus.INTERRUPTED,
        reason: InterruptedReason.LWT,
      },
      event.farmId,
    );
  } catch (error) {
    this.logger.error(
      `Error handling pump.disconnected for device ${deviceId}:`,
      error,
    );
  }
}
```

### Step 7: Implement closeSession with aggregate queries

Add private methods to `src/pump/pump.service.ts`:

```typescript
private async closeSession(
  session: PumpSession,
  endedAt: Date,
  status: PumpSessionStatus,
  reason?: InterruptedReason,
) {
  session.endedAt = endedAt;
  session.status = status;
  session.interruptedReason = reason || null;
  session.durationSeconds =
    (endedAt.getTime() - session.startedAt.getTime()) / 1000;

  // Compute sensor aggregates
  await this.computeSessionAggregates(session);

  // Compute overcurrent data
  await this.computeOvercurrentData(session);

  await this.pumpSessionRepo.save(session);

  // Only update totalOperatingHours for completed sessions
  if (status === PumpSessionStatus.COMPLETED && session.durationSeconds > 0) {
    const durationHours = session.durationSeconds / 3600;
    await this.deviceRepo
      .createQueryBuilder()
      .update(Device)
      .set({
        totalOperatingHours: () =>
          `"totalOperatingHours" + ${durationHours}`,
      })
      .where('id = :id', { id: session.deviceId })
      .execute();

    this.logger.log(
      `Device ${session.deviceId} totalOperatingHours += ${durationHours.toFixed(2)}h`,
    );
  }
}
```

### Step 8: Implement computeSessionAggregates

```typescript
private async computeSessionAggregates(session: PumpSession) {
  const { deviceId, startedAt, endedAt } = session;

  // Temperature aggregates
  const tempStats = await this.getSensorAggregates(
    deviceId,
    SensorType.PUMP_TEMPERATURE,
    startedAt,
    endedAt,
  );
  if (tempStats) {
    session.tempMin = tempStats.min;
    session.tempMax = tempStats.max;
    session.tempAvg = tempStats.avg;
  }

  // Pressure aggregates
  const pressureStats = await this.getSensorAggregates(
    deviceId,
    SensorType.WATER_PRESSURE,
    startedAt,
    endedAt,
  );
  if (pressureStats) {
    session.pressureMin = pressureStats.min;
    session.pressureMax = pressureStats.max;
    session.pressureAvg = pressureStats.avg;
  }

  // Flow aggregates (uses SUM for total)
  const flowStats = await this.getSensorAggregates(
    deviceId,
    SensorType.WATER_FLOW,
    startedAt,
    endedAt,
  );
  if (flowStats) {
    session.flowMin = flowStats.min;
    session.flowMax = flowStats.max;
    session.flowTotal = flowStats.sum;
  }

  // Current aggregates
  const currentStats = await this.getSensorAggregates(
    deviceId,
    SensorType.ELECTRICAL_CURRENT,
    startedAt,
    endedAt,
  );
  if (currentStats) {
    session.currentMin = currentStats.min;
    session.currentMax = currentStats.max;
    session.currentAvg = currentStats.avg;
  }

  // Phase count (distinct values)
  const phaseResult = await this.sensorDataRepo
    .createQueryBuilder('sd')
    .select('COUNT(DISTINCT sd.value)', 'count')
    .where('sd.deviceId = :deviceId', { deviceId })
    .andWhere('sd.sensorType = :sensorType', {
      sensorType: SensorType.ELECTRICAL_PHASE,
    })
    .andWhere('sd.createdAt >= :from', { from: startedAt })
    .andWhere('sd.createdAt <= :to', { to: endedAt })
    .getRawOne();

  session.phaseCount = parseInt(phaseResult?.count || '0', 10);
}

private async getSensorAggregates(
  deviceId: string,
  sensorType: SensorType,
  from: Date,
  to: Date,
): Promise<{ min: number; max: number; avg: number; sum: number } | null> {
  const result = await this.sensorDataRepo
    .createQueryBuilder('sd')
    .select('MIN(sd.value)', 'min')
    .addSelect('MAX(sd.value)', 'max')
    .addSelect('AVG(sd.value)', 'avg')
    .addSelect('SUM(sd.value)', 'sum')
    .where('sd.deviceId = :deviceId', { deviceId })
    .andWhere('sd.sensorType = :sensorType', { sensorType })
    .andWhere('sd.createdAt >= :from', { from })
    .andWhere('sd.createdAt <= :to', { to })
    .getRawOne();

  if (!result || result.min === null) return null;

  return {
    min: parseFloat(result.min),
    max: parseFloat(result.max),
    avg: parseFloat(result.avg),
    sum: parseFloat(result.sum),
  };
}
```

### Step 9: Implement computeOvercurrentData

```typescript
private async computeOvercurrentData(session: PumpSession) {
  const { deviceId, startedAt, endedAt } = session;

  // Query AlertLog for electrical_current CRITICAL alerts during session
  const overcurrentAlerts = await this.alertLogRepo
    .createQueryBuilder('al')
    .where('al.deviceId = :deviceId', { deviceId })
    .andWhere('al.sensorType = :sensorType', {
      sensorType: SensorType.ELECTRICAL_CURRENT,
    })
    .andWhere('al.level = :level', { level: ThresholdLevel.CRITICAL })
    .andWhere('al.createdAt >= :from', { from: startedAt })
    .andWhere('al.createdAt <= :to', { to: endedAt })
    .getMany();

  if (overcurrentAlerts.length > 0) {
    session.overcurrentDetected = true;
    session.overcurrentCount = overcurrentAlerts.length;
    session.overcurrentMaxCurrent = Math.max(
      ...overcurrentAlerts.map((a) => a.value),
    );
    session.hasAlert = true;
  }

  // Also check for any alerts (not just overcurrent)
  if (!session.hasAlert) {
    const anyAlert = await this.alertLogRepo
      .createQueryBuilder('al')
      .where('al.deviceId = :deviceId', { deviceId })
      .andWhere('al.createdAt >= :from', { from: startedAt })
      .andWhere('al.createdAt <= :to', { to: endedAt })
      .getCount();

    session.hasAlert = anyAlert > 0;
  }
}
```

### Step 10: Implement getLastSensorTimestamp helper

```typescript
private async getLastSensorTimestamp(deviceId: string): Promise<Date | null> {
  const result = await this.sensorDataRepo
    .createQueryBuilder('sd')
    .select('MAX(sd.createdAt)', 'lastAt')
    .where('sd.deviceId = :deviceId', { deviceId })
    .getRawOne();

  return result?.lastAt ? new Date(result.lastAt) : null;
}
```

## Todo List

- [ ] Add event interfaces to `pump.service.ts`
- [ ] Add pump event emission to `SyncService.handleDeviceTelemetry()`
- [ ] Add LWT detection to `SyncService.handleDeviceStatus()`
- [ ] Implement `@OnEvent('pump.started')` handler
- [ ] Implement `publishSessionId()` private method
- [ ] Implement `@OnEvent('pump.stopped')` handler
- [ ] Implement `@OnEvent('pump.disconnected')` handler
- [ ] Implement `closeSession()` private method with atomic totalOperatingHours
- [ ] Implement `computeSessionAggregates()` with sensor queries
- [ ] Implement `computeOvercurrentData()` with AlertLog queries
- [ ] Implement `getLastSensorTimestamp()` helper
- [ ] Run `yarn build` to verify compilation
- [ ] Manual test: send pumpStatus=1 telemetry via MQTT, verify session created and sessionId published

## Success Criteria

- Sending `{ pumpStatus: 1, temperature: 50 }` to `device/{id}/telemetry` creates a PumpSession and publishes sessionId to `device/{id}/session`
- Sending `{ pumpStatus: 0, sessionId: "xxx" }` closes the session as `completed` with sensor aggregates populated
- Sending `{ pumpStatus: 0 }` (no sessionId) closes the session as `interrupted/esp_reboot`
- LWT status message closes active session as `interrupted/lwt`
- Device.totalOperatingHours incremented only for `completed` sessions
- WebSocket clients receive `pump_session_started` and `pump_session_ended` events

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition: two pump.started events in quick succession | Low | findOne + create is non-atomic but ESP sends pumpStatus=1 once per cycle; reuse check handles duplicates |
| Aggregate queries slow on large SensorData | Medium | Queries use indexed (deviceId, sensorType, createdAt) composite index; session windows are short (minutes to hours) |
| totalOperatingHours increment not perfectly atomic under extreme concurrency | Low | Uses SQL increment expression (not read-modify-write); TypeORM QueryBuilder generates `SET "totalOperatingHours" = "totalOperatingHours" + N` |
| LWT emits pump.disconnected even if no pump was running | None | Handler checks for active session, returns early if none |
