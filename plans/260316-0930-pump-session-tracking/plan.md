---
title: "Pump Session Tracking"
description: "Track pump on/off sessions with lifecycle management, maintenance warnings, reports, and Excel export"
status: completed
priority: P1
effort: 14h
branch: master
tags: [pump, session, mqtt, iot, reports, excel]
created: 2026-03-16
---

# Pump Session Tracking - Implementation Plan

## Summary

Track pump on/off cycles end-to-end: session duration, sensor aggregates (temp, pressure, flow, current, phase), overcurrent detection, device maintenance life tracking, reports with auto-granularity timeline, and Excel export. Uses MQTT session ID handshake with ESP devices, LWT disconnect handling, and stale session cron cleanup.

## Architecture Overview

```
ESP Device                          NestJS Server
    |                                    |
    |-- telemetry (pumpStatus=1) ------->|  emit 'pump.started'
    |<-- device/{id}/session (UUID) -----|  PumpService creates session
    |                                    |
    |-- telemetry (sensors) ------------>|  SensorService stores data
    |                                    |
    |-- telemetry (pumpStatus=0,         |  emit 'pump.stopped'
    |    sessionId=UUID) --------------->|  PumpService closes session
    |                                    |  query SensorData aggregates
    |                                    |  update Device.totalOperatingHours
    |                                    |
    |-- LWT (disconnect) -------------->|  emit 'pump.disconnected'
    |                                    |  PumpService closes as interrupted
    |                                    |
    |            @Interval(60s) -------->|  Stale session cron
    |                                    |  close sessions with no data >30s
```

## Phase Overview

| Phase | Description | Effort | Status |
|-------|-------------|--------|--------|
| [Phase 1](./phase-01-entity-enum-setup.md) | Entity & Enum Setup | 2h | completed |
| [Phase 2](./phase-02-pump-module-foundation.md) | PumpModule Foundation | 1.5h | completed |
| [Phase 3](./phase-03-session-lifecycle.md) | Session Lifecycle (Event Handlers) | 4h | completed |
| [Phase 4](./phase-04-stale-session-cron.md) | Stale Session Cron | 1.5h | completed |
| [Phase 5](./phase-05-report-api.md) | Report API | 3h | completed |
| [Phase 6](./phase-06-excel-export.md) | Excel Export | 2h | completed |

## Key Dependencies

- Phase 2 depends on Phase 1 (entity must exist)
- Phase 3 depends on Phase 2 (PumpService must exist)
- Phase 4 depends on Phase 3 (session lifecycle must work)
- Phase 5 depends on Phase 3 (sessions must be created)
- Phase 6 depends on Phase 5 (report logic to reuse)

## Files Created

```
src/pump/
  pump.module.ts
  pump.service.ts
  pump.controller.ts
  entities/pump-session.entity.ts
  dto/pump-report-query.dto.ts
  enums/pump-session-status.enum.ts
  enums/interrupted-reason.enum.ts
```

## Files Modified

- `src/sensor/enums/sensor-type.enum.ts` -- add PUMP_STATUS
- `src/device/entities/device.entity.ts` -- add operatingLifeHours, totalOperatingHours
- `src/device/dto/create-device.dto.ts` -- add operatingLifeHours (optional)
- `src/device/sync/sync.service.ts` -- emit pump.started/stopped/disconnected events
- `src/app.module.ts` -- import PumpModule
- `package.json` -- add exceljs dependency

## New Dependency

- `exceljs` -- Excel generation (Phase 6)
