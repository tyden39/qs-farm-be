# Brainstorm: Fertilizer Machine Feature

**Date:** 2026-03-25
**Topic:** Add fertilizer machine (máy bón phân) managed by same ESP device

---

## Problem Statement

Add fertilizer machine support to existing IoT farm platform. The machine shares the same ESP/Device with irrigation but needs:
- Separate schedule, threshold, sensor, and log management
- Optional feature — can be enabled/disabled per device config

---

## Current State

- Device entity has `pumpEnabled: boolean` (pump on/off state)
- `SensorConfig` isolates by `sensorType` enum (unique per device+type)
- `DeviceSchedule` reusable with any `command` + `params`
- `CommandLog`, `AlertLog` both have `sensorType` field for filtering
- Event-driven pipeline: telemetry → SensorService → ThresholdService → commands/alerts

---

## Evaluated Approaches

### Option A: Pure SensorType Extension (Rejected)
Extend enum + reuse everything, no feature flag.
- **Con:** No clean way to disable entire feature. Fertilizer and irrigation mixed in APIs.

### Option B: Separate FertilizerModule + new entities (Rejected for MVP)
New `FertilizerConfig`, `FertilizerSchedule` entities.
- **Con:** Over-engineered for MVP. User confirmed schedules are ON/OFF only → DeviceSchedule reusable.

### Option C: Minimal Extension — Chosen ✓
Zero new entities. Extend Device with 2 boolean fields. Reuse all existing infra.

---

## Final Solution

### Device entity — 2 new fields

```typescript
@Column({ default: false })
hasFertilizer: boolean        // device has fertilizer machine attached (feature flag)

@Column({ default: false })
fertilizerEnabled: boolean    // fertilizer machine current ON/OFF state
```

**Semantic distinction:**
- `hasFertilizer = false` → skip all fertilizer processing, hide from UI
- `hasFertilizer = true, fertilizerEnabled = false` → feature available, machine is OFF
- `hasFertilizer = true, fertilizerEnabled = true` → machine is ON

### Schedule — Reuse DeviceSchedule

```typescript
// Fertilizer schedule = DeviceSchedule with fertilizer command
{
  command: 'fertilizer_on',   // or 'fertilizer_off'
  params: { duration: 1800 }, // optional
  daysOfWeek: [1, 3, 5],
  time: '07:00'
}
```

Filter fertilizer schedules: `WHERE command LIKE 'fertilizer%'`

### Sensor — Deferred

SensorType enum extension deferred until sensor types are finalized. Candidates:
- `fertilizer_level` — tank level (%)
- `fertilizer_flow` — flow rate (L/min)
- `fertilizer_ec` — electrical conductivity (mS/cm)

### Log — Zero change

`CommandLog` naturally separates by `command` field.
`AlertLog` separates by `sensorType` when sensors are added.

### Guard logic

In `SyncService` and `ScheduleService`:
```typescript
if (command.startsWith('fertilizer') && !device.hasFertilizer) {
  return; // skip
}
```

---

## Implementation Scope (MVP)

1. Add `hasFertilizer` + `fertilizerEnabled` to Device entity
2. Update Device DTOs (create/update/response)
3. Add guard in `SyncService.sendCommandToDevice()`
4. Add guard in `ScheduleService` execute loop
5. Handle `fertilizer_on`/`fertilizer_off` MQTT commands via `SyncService`
6. Update DeviceSchedule API docs/Swagger if needed

**Deferred:** sensor types, thresholds, alerts — add when hardware sensor specs finalized.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| MQTT command name conflicts | Prefix all fertilizer cmds with `fertilizer_` |
| `pumpEnabled` semantic confusion with `fertilizerEnabled` | Document clearly in Swagger |
| Schema migration on production | TypeORM `synchronize: true` handles it, test on staging first |

---

## Success Criteria

- [ ] `hasFertilizer = false` → no fertilizer schedules execute, no MQTT fertilizer cmds sent
- [ ] `fertilizerEnabled` toggleable independently from pump
- [ ] Fertilizer schedules visible separately from irrigation schedules (frontend filter)
- [ ] CommandLog queryable by fertilizer commands
- [ ] Zero regression on existing pump/irrigation functionality

---

## Next Steps

1. Create implementation plan (phases: entity → DTO → service guards → MQTT → tests)
2. Finalize fertilizer sensor types with hardware team
3. Add FertilizerSchedule API endpoint (or reuse DeviceSchedule with filter param)
