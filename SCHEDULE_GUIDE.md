# Schedule Module — Usage Guide

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

Base URL: `/api/schedule`

---

## 1. Create a Recurring Schedule

Send a command to a device on specific days and time. Days use 0=Sunday through 6=Saturday.

```bash
# Turn on irrigation every Mon/Wed/Fri at 06:00 (Vietnam time)
POST /api/schedule
{
  "name": "Morning irrigation",
  "type": "recurring",
  "deviceId": "abc-123",
  "command": "PUMP_ON",
  "params": { "duration": 1800 },
  "daysOfWeek": [1, 3, 5],
  "time": "06:00",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

---

## 2. Create a One-Time Schedule

Run a command once at a specific date/time, then auto-disable.

```bash
# Run calibration on a specific date
POST /api/schedule
{
  "name": "Sensor calibration",
  "type": "one_time",
  "deviceId": "abc-123",
  "command": "CALIBRATE",
  "params": { "sensor": "soil_moisture" },
  "executeAt": "2026-02-15T10:00:00.000Z",
  "timezone": "UTC"
}
```

After execution, the schedule's `enabled` is set to `false` automatically.

---

## 3. Farm-Wide Schedules

Target all devices in a farm instead of a single device. Provide `farmId` instead of `deviceId` (exactly one must be set).

```bash
# Turn off all pumps in the farm every night at 22:00
POST /api/schedule
{
  "name": "Nightly shutdown",
  "type": "recurring",
  "farmId": "farm-456",
  "command": "PUMP_OFF",
  "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
  "time": "22:00",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

The system iterates all devices in the farm and sends the command to each. If one device fails, the others still receive the command.

---

## 4. List & Filter Schedules

```bash
# List all schedules
GET /api/schedule

# Filter by device
GET /api/schedule?deviceId=abc-123

# Filter by farm
GET /api/schedule?farmId=farm-456

# Get a single schedule
GET /api/schedule/{id}
```

---

## 5. Update a Schedule

```bash
# Change time and days
PATCH /api/schedule/{id}
{
  "time": "07:30",
  "daysOfWeek": [1, 2, 3, 4, 5]
}

# Change command params
PATCH /api/schedule/{id}
{
  "params": { "duration": 3600 }
}
```

---

## 6. Toggle & Delete

```bash
# Toggle enabled/disabled (flips current state)
PATCH /api/schedule/{id}/toggle

# Delete a schedule
DELETE /api/schedule/{id}
```

Schedules are also deleted automatically when their associated device or farm is deleted (CASCADE).

---

## 7. Execution Behavior

The system checks all enabled schedules every 60 seconds.

**Recurring schedules:**
- Current time is converted to the schedule's timezone
- Checks if today's day-of-week is in `daysOfWeek` and current `HH:mm` matches `time`
- Prevents duplicate execution within the same minute via `lastExecutedAt`

**One-time schedules:**
- Fires when `executeAt` is in the past and `lastExecutedAt` is null
- Auto-disables after execution
- If the server was down when `executeAt` passed, the schedule fires on the next tick (catch-up)

Missed recurring occurrences (e.g., server downtime) are skipped — only the current minute is evaluated.

---

## 8. Example: Full Setup

```bash
# 1. Create recurring schedule for a device
POST /api/schedule
{
  "name": "Morning irrigation",
  "type": "recurring",
  "deviceId": "abc-123",
  "command": "PUMP_ON",
  "params": { "duration": 1800 },
  "daysOfWeek": [1, 3, 5],
  "time": "06:00",
  "timezone": "Asia/Ho_Chi_Minh"
}
# Response: { "id": "sched-uuid", "enabled": true, ... }

# 2. Create a matching shutdown schedule
POST /api/schedule
{
  "name": "Morning irrigation off",
  "type": "recurring",
  "deviceId": "abc-123",
  "command": "PUMP_OFF",
  "daysOfWeek": [1, 3, 5],
  "time": "06:30",
  "timezone": "Asia/Ho_Chi_Minh"
}

# 3. Temporarily disable the schedule
PATCH /api/schedule/sched-uuid/toggle
# Response: { "id": "sched-uuid", "enabled": false, ... }

# 4. Re-enable it
PATCH /api/schedule/sched-uuid/toggle
# Response: { "id": "sched-uuid", "enabled": true, ... }
```
