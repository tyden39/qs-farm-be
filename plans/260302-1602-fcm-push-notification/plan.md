---
title: "FCM Push Notification for IoT Farm"
description: "Add Firebase Cloud Messaging push notifications to NestJS backend for sensor alerts, schedule events, and system announcements"
status: complete
priority: P1
effort: 4h
branch: master
tags: [feature, backend, notification, fcm]
created: 2026-03-02
completed: 2026-03-03
---

# FCM Push Notification Implementation

## Overview

Add `firebase-admin` SDK to NestJS backend. New `NotificationModule` with `DeviceToken` entity (stores Flutter app FCM tokens), `FcmService` (sends push via Firebase), and controller endpoints for token registration. Integrate with existing `ThresholdService` (sensor alerts) and `ScheduleService` (schedule events).

## Context

- [Brainstorm Report](../reports/brainstorm-260302-1602-push-notification-fcm.md)
- Approach: FCM only (no Socket.IO notification)
- Target: Flutter mobile app (iOS + Android)
- Must deliver when app killed/background

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Entity + Module Setup | Complete | 1h | [phase-01](./phase-01-entity-module-setup.md) |
| 2 | FCM Service | Complete | 1.5h | [phase-02](./phase-02-fcm-service.md) |
| 3 | Controller + DTOs | Complete | 0.5h | [phase-03](./phase-03-controller-endpoints.md) |
| 4 | Integration with ThresholdService + ScheduleService | Complete | 1h | [phase-04](./phase-04-integration.md) |

## Dependencies

- Firebase project created + service account key JSON
- `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_BASE64` env var
- `yarn add firebase-admin`

## Architecture

```
Flutter App → POST /api/notification/register-token → DeviceToken table
                                                          ↓
ThresholdService.evaluate() ──→ FcmService.sendToFarmOwner() → Firebase → Flutter
ScheduleService.execute()  ──→ FcmService.sendToFarmOwner() → Firebase → Flutter
```

## Implementation Notes (As Built)

- `sendToDevice` renamed to `sendToFarmOwner` (unused `deviceId` param removed)
- Service account loaded via `fs.readFileSync` (not `require()`) per code review
- Entity join uses `Farm` class (not raw table string)
- `@IsNotEmpty()` added to token DTO
- FCM alert body has fallback when `reason` is undefined
- `sendToUser()` removed (YAGNI)
- `yarn build` passes with no errors
