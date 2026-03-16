# Phase 4: Stale Session Cron

## Context Links

- [Phase 3: Session Lifecycle](./phase-03-session-lifecycle.md)
- [ScheduleService](../../src/schedule/schedule.service.ts) -- @Interval + executing guard pattern
- [PumpService](../../src/pump/pump.service.ts) -- add cron here

## Overview

- **Priority:** P2
- **Status:** completed
- **Description:** Add @Interval(60_000) cron to PumpService that finds and closes stale active sessions (no sensor data in 30s)

## Key Insights

- Exact same `@Interval(60_000)` + `this.executing` guard pattern as `ScheduleService.processSchedules()`.
- `@nestjs/schedule` is already imported via `ScheduleModule` which calls `NestScheduleModule.forRoot()`. PumpModule does NOT need to re-import it -- `@Interval` decorator is globally available once forRoot is called.
- Stale threshold: 30 seconds without sensor data. This catches cases where ESP dies without LWT (e.g., gradual power loss, network isolation).
- endedAt = MAX(sensor_data.created_at) for that device during session window, NOT current time. This gives accurate session duration.
- Interrupted sessions do NOT add to totalOperatingHours (reuses `closeSession` from Phase 3 with `INTERRUPTED` status).

## Requirements

**Functional:**
- Every 60s, find all PumpSession with `status = active`
- For each, check if there's any SensorData for that deviceId in the last 30s
- If no recent data: close as interrupted/timeout with endedAt = last sensor timestamp
- Skip if another execution is in progress

**Non-functional:**
- Non-blocking: individual session failures don't abort the loop
- Logging: log each stale session closure

## Related Code Files

**Modify:**
- `src/pump/pump.service.ts` -- add stale session cron method

## Implementation Steps

### Step 1: Add imports

In `src/pump/pump.service.ts`, add Interval import:

```typescript
import { Interval } from '@nestjs/schedule';
```

### Step 2: Add executing guard property

Add to PumpService class, after the logger:

```typescript
private executing = false;
```

### Step 3: Implement stale session cron

Add to `src/pump/pump.service.ts`:

```typescript
@Interval(60_000)
async cleanupStaleSessions() {
  if (this.executing) return;
  this.executing = true;

  try {
    // Find all active sessions
    const activeSessions = await this.pumpSessionRepo.find({
      where: { status: PumpSessionStatus.ACTIVE },
    });

    if (activeSessions.length === 0) return;

    const now = Date.now();
    const STALE_THRESHOLD_MS = 30_000;

    for (const session of activeSessions) {
      try {
        // Check for recent sensor data for this device
        const recentData = await this.sensorDataRepo
          .createQueryBuilder('sd')
          .select('MAX(sd.createdAt)', 'lastAt')
          .where('sd.deviceId = :deviceId', { deviceId: session.deviceId })
          .getRawOne();

        const lastDataTime = recentData?.lastAt
          ? new Date(recentData.lastAt).getTime()
          : null;

        // If no data at all, or last data is older than 30s
        if (!lastDataTime || now - lastDataTime > STALE_THRESHOLD_MS) {
          const endedAt = lastDataTime
            ? new Date(lastDataTime)
            : session.startedAt;

          await this.closeSession(
            session,
            endedAt,
            PumpSessionStatus.INTERRUPTED,
            InterruptedReason.TIMEOUT,
          );

          this.logger.warn(
            `Stale session ${session.id} (device ${session.deviceId}) closed as timeout`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error checking stale session ${session.id}:`,
          error,
        );
      }
    }
  } catch (error) {
    this.logger.error('Error in cleanupStaleSessions:', error);
  } finally {
    this.executing = false;
  }
}
```

### Step 4: Verify no interaction with ScheduleService cron

Both ScheduleService and PumpService use `@Interval(60_000)` independently. NestJS schedule module handles multiple intervals fine -- they are separate timers. No conflict.

## Todo List

- [ ] Add `Interval` import from `@nestjs/schedule`
- [ ] Add `private executing = false` property
- [ ] Implement `cleanupStaleSessions()` with `@Interval(60_000)`
- [ ] Run `yarn build` to verify compilation
- [ ] Manual test: create active session, stop sending telemetry, wait 60s+, verify session closed as timeout

## Success Criteria

- Active sessions with no sensor data in >30s are closed as `interrupted/timeout`
- endedAt is set to the last sensor data timestamp, not current time
- totalOperatingHours is NOT incremented for timeout sessions
- Overlapping cron executions are prevented by the `executing` guard
- Individual session errors don't crash the entire cron loop

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cron closes session that just started (no data yet within 30s) | Low | New session gets its first telemetry data within seconds; 30s window is generous. If it does happen, the session was truly stale. |
| Many active sessions cause slow cron iteration | Low | Unlikely to have many simultaneous active pump sessions; each query uses indexed columns |
| Query for MAX(createdAt) is device-global, not session-scoped | Acceptable | If the device has ANY recent data, the session stays open. This is intentional -- it means the device is alive even if pumpStatus hasn't changed. |
