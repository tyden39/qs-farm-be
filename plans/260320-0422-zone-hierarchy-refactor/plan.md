---
status: completed
created: 2026-03-20
completed: 2026-03-20
branch: master
estimated_phases: 6
cook_flag: --auto
---

# Zone Hierarchy Refactor

Refactor flat `User → Farm → Device` to `User → Farm → Zone → Device` with config inheritance, GPS coordinates, irrigation-mode-aware thresholds, and zone-level controls.

## Brainstorm Report

[brainstorm-260320-0422-zone-hierarchy-refactor.md](../reports/brainstorm-260320-0422-zone-hierarchy-refactor.md)

## Key Decisions

- Zone ↔ Device: 1-to-many
- Config levels: Zone → Device (Farm has no irrigationMode/controlMode)
- checkAll: Soft override (device config preserved, ignored at runtime)
- Threshold: Per irrigationMode, with ZoneSensorConfig + ZoneThreshold entities
- Device keeps both farmId + zoneId (denormalized)
- Pump control: Zone + Device only (no farm-level)
- Coordinates: Farm/Zone = jsonb polygon, Device = lat/lng floats

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Database Entities & Module Setup](phase-01-database-entities-module-setup.md) | completed | critical | M |
| 2 | [Zone CRUD & API](phase-02-zone-crud-api.md) | completed | critical | M |
| 3 | [Zone Sensor Config & Threshold CRUD](phase-03-zone-sensor-config-threshold.md) | completed | critical | M |
| 4 | [Config Resolution Service](phase-04-config-resolution-service.md) | completed | critical | M |
| 5 | [Sensor Pipeline Integration](phase-05-sensor-pipeline-integration.md) | completed | critical | L |
| 6 | [Zone Pump Control & Schedule](phase-06-zone-pump-control-schedule.md) | completed | high | M |

## Dependencies

```
Phase 1 → Phase 2 → Phase 3
Phase 1 → Phase 4
Phase 3 + Phase 4 → Phase 5
Phase 2 + Phase 4 → Phase 6
```

## Risk Areas

- Migration: existing devices have no zone (nullable zoneId)
- Denormalized farmId must sync when device moves zones
- Threshold resolution perf: multiple fallback queries → cache
- checkAll toggle: must notify connected WS clients
