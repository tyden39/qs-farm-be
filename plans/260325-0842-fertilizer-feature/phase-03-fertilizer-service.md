---
phase: 3
title: "Fertilizer Service"
status: pending
priority: P1
---

# Phase 3: Fertilizer Service

## Overview

Create `fertilizer.service.ts` mirroring `pump.service.ts`. Handles session lifecycle (start/stop/disconnect/stale cleanup), report generation, and Excel export.

## Context Files (read before implementing)

- `src/pump/pump.service.ts` — primary reference (copy structure, adapt fields)
- `src/sensor/enums/sensor-type.enum.ts` — FERT_* types from Phase 1

## File to Create

### `src/fertilizer/fertilizer.service.ts`

## Implementation Steps

### 1. Event Interfaces

```typescript
export interface FertilizerStartedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
  controlMode?: string;
  // NO irrigationMode (unlike pump)
}

export interface FertilizerStoppedEvent {
  deviceId: string;
  farmId?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface FertilizerDisconnectedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
}
```

### 2. Constructor Dependencies

Same as PumpService:
- `@InjectRepository(FertilizerSession)` fertilizerSessionRepo
- `@InjectRepository(Device)` deviceRepo
- `@InjectRepository(SensorData)` sensorDataRepo
- `@InjectRepository(AlertLog)` alertLogRepo
- `MqttService` mqttService
- `DeviceGateway` deviceGateway

### 3. Session Lifecycle (mirror pump, adapt events)

| Method | Event | Differences from Pump |
|--------|-------|-----------------------|
| `handleFertilizerStarted()` | `@OnEvent('fertilizer.started')` | No irrigationMode validation. Publish to `device/{deviceId}/fert-session` topic. WS type: `fertilizer_session_started` |
| `handleFertilizerStopped()` | `@OnEvent('fertilizer.stopped')` | WS type: `fertilizer_session_ended` |
| `handleFertilizerDisconnected()` | `@OnEvent('fertilizer.disconnected')` | Same LWT pattern |
| `cleanupStaleSessions()` | `@Interval(60_000)` | Query FertilizerSession ACTIVE. Same 30s threshold. Separate `executing` flag |

### 4. closeSession() — Key Differences from Pump

- NO `totalOperatingHours` update on device (fertilizer doesn't track operating life)
- Calls `computeSessionAggregates()` and `computeOvercurrentData()` same as pump

### 5. computeSessionAggregates() — Use FERT_* Sensor Types

```typescript
// Temperature: SensorType.FERT_TEMPERATURE (not PUMP_TEMPERATURE)
// Current: SensorType.FERT_CURRENT (not ELECTRICAL_CURRENT)
// Phase: SensorType.FERT_PHASE (not ELECTRICAL_PHASE)
// NO pressure or flow aggregates
```

### 6. computeOvercurrentData() — Use FERT_CURRENT

Query `AlertLog` where `sensorType = SensorType.FERT_CURRENT` and `level = CRITICAL`.

### 7. getSensorAggregates() — Reuse Same Pattern

Same helper as pump: MIN/MAX/AVG/SUM query on sensorDataRepo.

### 8. getLastSensorTimestamp()

Filter by FERT_* sensor types only (so pump data doesn't affect fertilizer stale detection):

```typescript
.where('sd.deviceId = :deviceId', { deviceId })
.andWhere('sd.sensorType IN (:...types)', {
  types: [SensorType.FERT_TEMPERATURE, SensorType.FERT_CURRENT, SensorType.FERT_PHASE],
})
```

### 9. Report API: getReport()

```typescript
async getReport(deviceId: string, query: FertilizerReportQueryDto) {
  const from = query.from ? new Date(query.from) : new Date(0);
  const to = query.to ? new Date(query.to) : new Date();

  const [summary, timeline, sessions] = await Promise.all([
    this.getSummary(deviceId, from, to),
    this.getTimeline(deviceId, from, to),
    this.getSessions(deviceId, from, to),
  ]);

  return { summary, timeline, sessions };
  // NO maintenanceInfo (unlike pump)
}
```

### 10. getSummary() — No modeBreakdown, No flow/pressure

```typescript
// Select: totalSessions, totalDurationSeconds, avgDurationSeconds
//         tempMin/Max, currentMin/Max
//         overcurrentSessions, overcurrentTotalCount
// NO: totalFlow, pressureMin/Max, modeBreakdown
```

### 11. getTimeline() — No flow

Same DATE_TRUNC bucketing. Return sessionCount, totalDurationMinutes, avgDurationMinutes. NO totalFlow.

### 12. Excel Export: getReportExcel()

Sheet: "Fertilizer Sessions". Columns:
- Session #, Control Mode, Start, End, Duration (min)
- Temp Min, Temp Max, Current Max, Overcurrent, Phase Count, Alert, Status

NO: Irrigation Mode, Pressure Min/Max, Flow Total columns.

Footer row with totals (same pattern as pump).

NO Maintenance sheet.

## DTO File to Create

### `src/fertilizer/dto/fertilizer-report-query.dto.ts`

Copy from `src/pump/dto/pump-report-query.dto.ts` — identical structure (from, to, format).

## Success Criteria

- [ ] Service handles fertilizer.started/stopped/disconnected events
- [ ] Stale session cleanup runs independently of pump cleanup
- [ ] Aggregates use FERT_* sensor types
- [ ] Report returns summary (no modeBreakdown), timeline (no flow), sessions
- [ ] Excel export with FertilizerSessions sheet
- [ ] Project compiles
