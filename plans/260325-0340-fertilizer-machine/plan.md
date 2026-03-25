---
title: "Fertilizer Machine Feature"
description: "Add optional fertilizer machine support to Device — hasFertilizer flag + fertilizerEnabled ON/OFF, reusing existing infra"
status: completed
priority: P2
effort: 3h
branch: master
tags: [feature, backend, database, api]
created: 2026-03-25
completed: 2026-03-25
---

# Fertilizer Machine Feature

## Overview

Add optional fertilizer machine (máy bón phân) support to the IoT farm platform. The machine shares the same ESP/Device as irrigation. Feature is toggled per-device via `hasFertilizer`. Machine ON/OFF state is tracked via `fertilizerEnabled`. All existing infrastructure (Schedule, CommandLog, AlertLog, SensorConfig) is reused.

## Context

- Brainstorm report: [brainstorm-260325-0340-fertilizer-machine.md](../reports/brainstorm-260325-0340-fertilizer-machine.md)

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Entity + DTO | Completed | 1h | [phase-01](./phase-01-entity-dto.md) |
| 2 | Service Guards | Completed | 1h | [phase-02-service-guards.md](./phase-02-service-guards.md) |
| 3 | Tests | Completed | 1h | [phase-03-tests.md](./phase-03-tests.md) |

## Dependencies

- Phase 2 blocked by Phase 1 (entity must exist before guards reference it)
- Phase 3 blocked by Phase 2 (tests validate guard logic)
- TypeORM `synchronize: true` handles schema migration automatically
