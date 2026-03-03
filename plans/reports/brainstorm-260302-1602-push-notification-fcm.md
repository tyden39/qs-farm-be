# Brainstorm: Push Notification via FCM

## Problem Statement
Need push notifications for mobile app (Flutter) to alert users about sensor threshold breaches, schedule events, and system announcements — even when app is killed/background.

## Requirements
- **Target:** Flutter mobile app (iOS + Android)
- **Offline delivery:** Mandatory — user must receive alerts when app killed
- **Notification types:** Sensor alerts (CRITICAL/WARNING), schedule events, system announcements
- **Backend:** NestJS 8, existing Socket.IO + MQTT infrastructure

## Evaluated Approaches

### A. Socket.IO Only
- **Pros:** Zero effort, already exists
- **Cons:** Cannot deliver when app killed/background — dealbreaker for CRITICAL IoT alerts
- **Verdict:** Rejected

### B. FCM Only (CHOSEN)
- **Pros:** Reliable offline delivery, free, mature Flutter ecosystem, low effort
- **Cons:** Firebase setup needed, iOS needs Apple Developer account, 4KB payload limit, slight latency
- **Verdict:** Best balance of simplicity + reliability

### C. Hybrid Socket.IO + FCM
- **Pros:** Best UX — instant in-app + offline push
- **Cons:** Duplicate suppression logic, more maintenance
- **Verdict:** Over-engineering for current stage — can upgrade later if needed

## Final Solution: FCM Only

### Backend Changes (NestJS)

**New entity:** `DeviceToken`
- `id` (UUID), `userId`, `token` (FCM token string), `platform` (ios/android), `createdAt`, `updatedAt`
- Unique constraint on `token`

**New service:** `FcmService`
- Uses `firebase-admin` SDK
- `sendToUser(userId, notification)` — query all user's device tokens, send via FCM
- `sendToFarmUsers(farmId, notification)` — send to all users of a farm
- Handle token invalidation (remove stale tokens on FCM error)

**New controller endpoints:**
- `POST /api/notifications/register-token` — Flutter app sends FCM token after login
- `DELETE /api/notifications/unregister-token` — cleanup on logout
- `GET /api/notifications/history` — optional, fetch past notifications

**Integration points:**
- `ThresholdService` → call `FcmService.sendToFarmUsers()` when threshold breached
- `ScheduleService` → call `FcmService.sendToUser()` when schedule completes/fails
- System announcements → admin endpoint → broadcast to all users

### Flutter Changes
- Add `firebase_messaging` + `firebase_core` packages
- Request notification permission on first launch
- Get FCM token → POST to backend on login
- Handle foreground/background/terminated notification states
- Tap notification → deep link to relevant screen

### Firebase Setup
- Create Firebase project
- Add Android app (google-services.json)
- Add iOS app (GoogleService-Info.plist + APNs key)
- Generate service account key for backend (firebase-admin)

## Implementation Considerations
- FCM payload max 4KB → send title/body/type/entityId only, app fetches detail via API
- Token refresh: Flutter app should re-register token on each login + listen to `onTokenRefresh`
- iOS: requires Apple Developer account ($99/yr) for APNs
- Notification entity in DB for history/read-status tracking (optional, phase 2)
- Rate limit: FCM free tier = no practical limit for farm-scale usage

## Risks
| Risk | Mitigation |
|---|---|
| FCM token stale/invalid | Remove token on FCM 404 error, re-register on app launch |
| iOS APNs setup complexity | Follow Firebase docs, test with TestFlight |
| Google infra dependency | Acceptable risk — 99.9%+ uptime, industry standard |
| Notification spam | Leverage existing anti-spam in ThresholdService (30s cooldown) |

## Success Metrics
- Notification delivered within 3s for 95% of messages
- Zero missed CRITICAL alerts for online devices
- FCM token registration on 100% of app installs

## Next Steps
1. Setup Firebase project + config files
2. Implement `DeviceToken` entity + migration
3. Implement `FcmService` with firebase-admin
4. Add token register/unregister endpoints
5. Integrate with ThresholdService + ScheduleService
6. Flutter: add firebase_messaging, token management, notification handling
7. Test end-to-end: trigger threshold → receive push on killed app
