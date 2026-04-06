---
title: "Complete Device Reset / Clean Device Data"
status: in-progress
created: 2026-04-06
---

# Device Reset / Clean Device Data

## Problem

`DELETE /device/:id` calls `deviceRepository.remove()` only — no cleanup of related data.
After deletion, orphaned rows remain: SensorData, AlertLog, CommandLog, SensorConfig,
SensorThreshold, PairingToken. Re-pairing a deleted-then-re-created device returns stale data.

## Goals

1. Enhance `DELETE /device/:id` — clean all related data before removing device row
2. Add `POST /device/:id/reset` — clear all data + reset status to PENDING (keep device row),
   so device can be re-provisioned/re-paired as fresh

## Data to Clean (all operations)

| Table | Condition | Note |
|-------|-----------|------|
| AlertLog | deviceId | direct delete |
| CommandLog | deviceId | direct delete |
| SensorData | deviceId | direct delete (can be large) |
| DeviceSchedule | deviceId | direct delete (CASCADE exists but only on row delete) |
| SensorConfig | deviceId | direct delete — DB CASCADE removes SensorThreshold |
| PairingToken | serial | no FK, matched by serial string |

SensorThreshold has `onDelete: 'CASCADE'` on FK → auto-deleted when SensorConfig is deleted ✓

## Architecture

```
DeviceService
  + remove(id)            → cleanDeviceData() → remove device row
  + resetDevice(id)       → cleanDeviceData() → reset device fields to PENDING
  - cleanDeviceData(id, serial)  → transactional bulk delete of all related data

DeviceController
  DELETE /:id             → existing, enhanced
  POST   /:id/reset       → NEW endpoint
```

## Phase

| Phase | Description | Status |
|-------|-------------|--------|
| [Phase 1](./phase-01-implement-device-reset.md) | Implement reset logic + endpoint | todo |
