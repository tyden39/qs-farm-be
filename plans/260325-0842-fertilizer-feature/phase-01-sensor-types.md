---
phase: 1
title: "Add FERT_* Sensor Types"
status: pending
priority: P1
---

# Phase 1: Add Fertilizer Sensor Types

## Overview

Add 4 new sensor types to the existing `SensorType` enum, their Vietnamese labels, and ESP payload key mappings.

## File to Modify

- `src/sensor/enums/sensor-type.enum.ts`

## Implementation Steps

### 1. Add enum values

```typescript
// Add after PUMP_STATUS:
FERT_TEMPERATURE = 'fert_temperature',
FERT_CURRENT = 'fert_current',
FERT_PHASE = 'fert_phase',
FERT_STATUS = 'fert_status',
```

### 2. Add labels to SENSOR_TYPE_LABEL

```typescript
[SensorType.FERT_TEMPERATURE]: 'Nhiet do may bon phan',
[SensorType.FERT_CURRENT]: 'Dong dien may bon phan',
[SensorType.FERT_PHASE]: 'Pha dien may bon phan',
[SensorType.FERT_STATUS]: 'Trang thai may bon phan',
```

### 3. Add payload mappings to PAYLOAD_TO_SENSOR_TYPE

```typescript
fertTemperature: SensorType.FERT_TEMPERATURE,
fertCurrent: SensorType.FERT_CURRENT,
fertPhase: SensorType.FERT_PHASE,
fertStatus: SensorType.FERT_STATUS,
```

## Success Criteria

- [ ] 4 new enum values added
- [ ] Labels map has 4 new entries
- [ ] Payload map has 4 new entries matching ESP firmware keys
- [ ] Project compiles (`yarn build`)

## Notes

- Once these sensor types exist, the existing `SensorService` telemetry pipeline will automatically store FERT_* readings in `sensor_data`
- Existing `ThresholdService` will evaluate thresholds for FERT_* configs automatically
- No changes needed to SensorService or ThresholdService
