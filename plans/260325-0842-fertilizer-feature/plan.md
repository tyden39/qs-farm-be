---
title: "Fertilizer Session, Threshold & Report Feature"
description: "Add fertilizer session tracking, reporting, and Excel export mirroring the pump feature"
status: pending
priority: P1
effort: 4h
branch: master
tags: [fertilizer, iot, sessions, reports]
created: 2026-03-25
---

# Fertilizer Feature Implementation Plan

## Overview

Add fertilizer session lifecycle, reporting, and Excel export. Mirrors the existing pump feature but for fertilizer-specific sensors (FERT_TEMPERATURE, FERT_CURRENT, FERT_PHASE, FERT_STATUS). Both pump and fertilizer run on the same ESP device; differentiation is via distinct sensor types and payload keys.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Sensor Types](./phase-01-sensor-types.md) | pending | 1 modified |
| 2 | [Entity + Enums](./phase-02-fertilizer-session-entity.md) | pending | 4 created |
| 3 | [Service](./phase-03-fertilizer-service.md) | pending | 1 created |
| 4 | [Controller + Module](./phase-04-fertilizer-controller-module.md) | pending | 2 created |
| 5 | [SyncService Events](./phase-05-sync-service-events.md) | pending | 1 modified |
| 6 | [AppModule Registration](./phase-06-app-module.md) | pending | 1 modified |

## Dependencies

- Phases 1-2 must complete before Phase 3 (service needs entity + sensor types)
- Phase 3 before Phase 4 (controller needs service)
- Phase 5 independent of 3-4 but logically follows
- Phase 6 last (registers the module)

## Key Decisions

- Fertilizer has NO `irrigationMode` (no equivalent concept)
- Fertilizer has NO `maintenanceInfo` (no totalOperatingHours tracking)
- Fertilizer has NO `flowTotal`/`pressureMin`/`pressureMax` fields
- Summary has NO `modeBreakdown`
- Uses FERT_* sensor types to avoid collision with pump sensors on same device
- MQTT session topic: `device/{deviceId}/fert-session`
- Overcurrent detection uses `FERT_CURRENT` CRITICAL alerts
- Stale session cleanup uses same 30s threshold, separate `@Interval`
