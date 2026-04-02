# Push Notification & i18n Audit Report

**Date:** 2026-04-02  
**Focus:** Notification service code, hardcoded strings, and Vietnamese translation status

---

## 1. Notification Service Architecture

### Core Files
- **FCM Service:** `/home/duc/workspace/qs-farm/src/notification/fcm.service.ts`
  - Firebase Cloud Messaging implementation
  - Interface: `FcmNotification` with `title` and `body` fields
  - Method: `sendToFarmOwner(farmId, notification)` 
  - Status: Initialized via Firebase Admin SDK (env: `FIREBASE_SERVICE_ACCOUNT_PATH`)

- **Notification Controller:** `/home/duc/workspace/qs-farm/src/notification/notification.controller.ts`
  - POST `/notification/register-token` - Register device FCM token
  - DELETE `/notification/unregister-token` - Unregister device token
  - **Hardcoded String:** `'Token unregistered'` (English)

- **Device Token Entity:** `/home/duc/workspace/qs-farm/src/notification/entities/device-token.entity.ts`
  - Stores FCM tokens per user
  - Supports: iOS, ANDROID (Platform enum)

---

## 2. Notification Trigger Points

### 2.1 Sensor Threshold Alerts
**File:** `/home/duc/workspace/qs-farm/src/sensor/threshold.service.ts` (Lines 212-238)

```typescript
this.fcmService.sendToFarmOwner(farmId, {
  title: `${THRESHOLD_LEVEL_LABEL[threshold.level] ?? threshold.level}: ${SENSOR_TYPE_LABEL[sensorType] ?? sensorType}`,
  body: reason ?? `${SENSOR_TYPE_LABEL[sensorType] ?? sensorType} ${direction === AlertDirection.BELOW ? 'dưới mức' : 'vượt mức'}`,
  data: { type: 'SENSOR_ALERT', deviceId, sensorType, level, alertLogId }
})
```

**Conditions:**
- Only sends when farm owner is OFFLINE (checked via WebSocket connection)
- Anti-spam: 30-second cooldown per device/sensor type

### 2.2 Schedule Execution Notifications
**File:** `/home/duc/workspace/qs-farm/src/schedule/schedule.service.ts` (Lines 333-342)

```typescript
this.fcmService.sendToFarmOwner(farmId, {
  title: `Schedule: ${schedule.name}`,
  body: `Command "${schedule.command}" executed`,
  data: { type: 'SCHEDULE_EXECUTED', scheduleId, command }
})
```

**Conditions:**
- Triggered after schedule command executes
- Only sends when farm owner is OFFLINE

---

## 3. Hardcoded English Strings Found

| Location | String | Type | Current Status |
|----------|--------|------|----------------|
| notification.controller.ts:50 | `'Token unregistered'` | Response message | English ❌ |
| schedule.service.ts:335 | `'Schedule: '` | Notification title prefix | English ❌ |
| schedule.service.ts:336 | `'Command " " executed'` | Notification body | English ❌ |
| fcm.service.ts:30 | `'FIREBASE_SERVICE_ACCOUNT_PATH not set'` | Log warning | English ❌ |
| fcm.service.ts:41 | `'Firebase Admin SDK initialized'` | Log message | English ❌ |

---

## 4. Vietnamese Strings (Localized)

### 4.1 Threshold Level Labels
**File:** `/home/duc/workspace/qs-farm/src/sensor/threshold.service.ts` (Lines 17-20)
```typescript
const THRESHOLD_LEVEL_LABEL: Record<string, string> = {
  critical: 'Nguy hiểm',      // Danger
  warning: 'Cảnh báo',        // Warning
};
```

### 4.2 Sensor Type Labels
**File:** `/home/duc/workspace/qs-farm/src/sensor/enums/sensor-type.enum.ts` (Lines 18-30)
```typescript
export const SENSOR_TYPE_LABEL: Record<SensorType, string> = {
  [SensorType.WATER_PRESSURE]: 'Áp suất nước',
  [SensorType.WATER_FLOW]: 'Lưu lượng nước',
  [SensorType.PUMP_TEMPERATURE]: 'Nhiệt độ máy bơm',
  [SensorType.SOIL_MOISTURE]: 'Độ ẩm đất',
  [SensorType.ELECTRICAL_CURRENT]: 'Dòng điện',
  [SensorType.ELECTRICAL_PHASE]: 'Pha điện',
  [SensorType.PUMP_STATUS]: 'Trạng thái bơm',
  [SensorType.FERT_TEMPERATURE]: 'Nhiệt độ máy phân',
  [SensorType.FERT_CURRENT]: 'Dòng điện máy phân',
  [SensorType.FERT_PHASE]: 'Pha điện máy phân',
  [SensorType.FERT_STATUS]: 'Trạng thái máy phân',
};
```

### 4.3 Sensor Reason Messages
**File:** `/home/duc/workspace/qs-farm/src/sensor/constants/threshold-rules.ts` (Lines 3-51)

12 sensor types with Vietnamese reason strings for below/above thresholds:
- `'Độ ẩm đất thấp'`, `'Độ ẩm đất cao'`
- `'Nhiệt độ máy bơm thấp'`, `'Nhiệt độ máy bơm quá cao'`
- `'Áp suất nước thấp'`, `'Áp suất nước cao'`
- `'Lưu lượng nước thấp'`, `'Lưu lượng nước cao'`
- `'Dòng điện thấp'`, `'Quá dòng điện'`
- `'Lỗi pha điện'`, `'Quá điện áp pha'`
- `'Trạng thái bơm thấp'`, `'Trạng thái bơm cao'`
- `'Nhiệt độ máy phân thấp'`, `'Nhiệt độ máy phân quá cao'`
- `'Dòng điện máy phân thấp'`, `'Quá dòng điện máy phân'`
- `'Lỗi pha điện máy phân'`, `'Quá điện áp pha máy phân'`
- `'Trạng thái máy phân thấp'`, `'Trạng thái máy phân cao'`

### 4.4 In-line Vietnamese String
**File:** `/home/duc/workspace/qs-farm/src/sensor/threshold.service.ts` (Line 220)
```typescript
direction === AlertDirection.BELOW ? 'dưới mức' : 'vượt mức'
// (below threshold / above threshold)
```

---

## 5. i18n/Localization Status

### Current State
- ❌ **No centralized i18n framework** (next-intl, i18next, ngx-translate, etc.)
- ❌ **No dedicated translation files** (no i18n/, locales/, translations/ directory)
- ✅ **Partial Vietnamese localization** - Sensor labels hardcoded as constants
- ❌ **Mixed languages** - English UI/API messages + Vietnamese notification content

### Translation Files
- **package.json:** No i18n libraries in dependencies
- **Project structure:** No i18n/ or locales/ directory in src/

---

## 6. Hardcoded English Strings to Translate

### Priority: HIGH (User-Facing Notifications)

1. **Notification Title Prefix**
   - Location: `src/schedule/schedule.service.ts:335`
   - Current: `'Schedule: ${schedule.name}'`
   - Needs: Vietnamese prefix like `'Lịch biểu:'` or similar

2. **Notification Body**
   - Location: `src/schedule/schedule.service.ts:336`
   - Current: `'Command "${schedule.command}" executed'`
   - Needs: Vietnamese like `'Lệnh "${schedule.command}" đã thực thi'`

### Priority: MEDIUM (API Response/Log Messages)

3. **Token Unregistered Response**
   - Location: `src/notification/notification.controller.ts:50`
   - Current: `{ message: 'Token unregistered' }`
   - Needs: `{ message: 'Mã thiết bị đã được xóa đăng ký' }` or similar

4. **FCM Disabled Warning**
   - Location: `src/notification/fcm.service.ts:30`
   - Current: `'FIREBASE_SERVICE_ACCOUNT_PATH not set — FCM disabled'`
   - May need translation for logs

---

## 7. Notification Data Flow

```
┌─────────────────────────────────────────┐
│ Sensor Data / Schedule Execution         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ ThresholdService / ScheduleService       │
│ (Threshold evaluate / Schedule execute)  │
└────────────┬────────────────────────────┘
             │
             ├─ Check: Is farm owner ONLINE?
             │  (via WebSocket connection)
             │
             ├─ YES → Skip FCM, send WebSocket
             │
             └─ NO ▼
              ┌─────────────────────────────┐
              │ Build FcmNotification        │
              │ - title (sensor/schedule)    │
              │ - body (reason/command)      │
              │ - data (metadata)            │
              └────────────┬────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │ FcmService.sendToFarmOwner   │
              │ (Firebase Cloud Messaging)  │
              └────────────┬────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │ Mobile App (iOS/Android)     │
              │ Displays Push Notification   │
              └─────────────────────────────┘
```

---

## 8. Notification Metadata

All notifications include typed `data` field for mobile app routing:

| Notification Type | data.type | Fields |
|---|---|---|
| Sensor Alert | `SENSOR_ALERT` | deviceId, sensorType, level, alertLogId |
| Schedule Executed | `SCHEDULE_EXECUTED` | scheduleId, command |

---

## Summary & Recommendations

### ✅ What's Working
- Sensor type and threshold level labels are Vietnamese
- Comprehensive sensor reason messages in Vietnamese
- FCM integration is properly implemented
- Offline-only notification system prevents spam

### ❌ What Needs Work
- **Schedule notification strings are English** (HIGH PRIORITY)
- **API response messages are English** (MEDIUM PRIORITY)
- **No i18n framework** for multi-language support
- **No centralized translation management**

### Recommendations
1. **Quick fix (no framework):**
   - Create `src/shared/i18n/` directory
   - Define `notifications.vi.ts` and `notifications.en.ts` with all message constants
   - Reference from services instead of hardcoding

2. **Better approach (with framework):**
   - Install `i18next` + `@nestjs/i18n` for backend
   - Create JSON translation files for Vietnamese and English
   - Implement locale detection based on user preference
   - Expose translations via API for mobile app

3. **Files requiring updates:**
   - `src/schedule/schedule.service.ts` (Lines 335-336)
   - `src/notification/notification.controller.ts` (Line 50)
   - `src/notification/fcm.service.ts` (Optional, for logs)

---

## Appendix: File Locations

| Component | Path |
|---|---|
| FCM Service | `src/notification/fcm.service.ts` |
| Notification Controller | `src/notification/notification.controller.ts` |
| Device Token Entity | `src/notification/entities/device-token.entity.ts` |
| Threshold Service | `src/sensor/threshold.service.ts` |
| Schedule Service | `src/schedule/schedule.service.ts` |
| Sensor Type Labels | `src/sensor/enums/sensor-type.enum.ts` |
| Threshold Reason Map | `src/sensor/constants/threshold-rules.ts` |
| Threshold Level Labels | `src/sensor/threshold.service.ts:17-20` |

