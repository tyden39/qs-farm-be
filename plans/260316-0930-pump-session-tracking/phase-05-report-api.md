# Phase 5: Report API

## Context Links

- [Phase 3: Session Lifecycle](./phase-03-session-lifecycle.md) -- sessions must exist
- [SensorService.getDeviceTimeseries](../../src/sensor/sensor.service.ts) -- DATE_TRUNC pattern (line 367-393)
- [SensorController](../../src/sensor/sensor.controller.ts) -- controller pattern
- [QuerySensorStatsDto](../../src/sensor/dto/query-sensor-stats.dto.ts) -- DTO pattern
- [TimeBucket enum](../../src/sensor/enums/time-bucket.enum.ts) -- reuse for auto granularity

## Overview

- **Priority:** P2
- **Status:** completed
- **Description:** Create REST endpoint `GET /api/pump/report/:deviceId` returning summary, maintenance info, auto-granularity timeline, and sessions list

## Key Insights

- Auto granularity: compute TimeBucket from date range. <=2d -> hour, <=60d -> day, <=365d -> week, >365d -> month. Same DATE_TRUNC approach as SensorService.
- Timeline aggregates PumpSession data (not SensorData) -- bucketed by startedAt. Each bucket: session count, total duration, avg duration, total flow.
- Summary: total sessions, total duration, avg duration, total flow, sensor ranges, overcurrent stats.
- maintenanceInfo: computed from Device.totalOperatingHours / Device.operatingLifeHours. Warning at 80%, required at 100%.
- Sessions list: paginated, ordered by startedAt DESC.
- `format` query param: `json` (default) or `excel` (Phase 6). In this phase, only `json` is handled.

## Requirements

**Functional:**
- `GET /api/pump/report/:deviceId?from=&to=&format=json` returns:
  - `summary`: totalSessions, totalDurationHours, avgDurationMinutes, totalFlow, tempRange, pressureRange, currentRange, overcurrentSessions, overcurrentTotalCount
  - `maintenanceInfo`: operatingLifeHours, totalOperatingHours, usagePercent, warningThreshold (80%), isWarning, isRequired
  - `timeline`: array of buckets with bucket timestamp, sessionCount, totalDurationMinutes, avgDurationMinutes, totalFlow
  - `sessions`: array of PumpSession entities (last 100 by default)

**Non-functional:**
- Reuse TimeBucket enum
- Efficient: summary uses aggregate SQL, not loading all sessions into memory

## Architecture

```
GET /api/pump/report/:deviceId?from=2026-01-01&to=2026-03-16
  |
  v
PumpController.getReport()
  |
  v
PumpService.getReport(deviceId, from, to)
  |-- getSummary(): aggregate query on pump_session
  |-- getMaintenanceInfo(): load Device, compute percentages
  |-- getTimeline(): DATE_TRUNC on pump_session.startedAt
  |-- getSessions(): find with pagination
  v
Response JSON
```

## Related Code Files

**Create:**
- `src/pump/dto/pump-report-query.dto.ts`

**Modify:**
- `src/pump/pump.controller.ts` -- add report endpoint
- `src/pump/pump.service.ts` -- add report methods

## Implementation Steps

### Step 1: Create PumpReportQueryDto

Create `src/pump/dto/pump-report-query.dto.ts`:

```typescript
import { IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PumpReportQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Response format',
    enum: ['json', 'excel'],
    default: 'json',
  })
  @IsOptional()
  @IsIn(['json', 'excel'])
  format?: string;
}
```

### Step 2: Add report endpoint to PumpController

In `src/pump/pump.controller.ts`:

```typescript
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PumpService } from './pump.service';
import { PumpReportQueryDto } from './dto/pump-report-query.dto';

@ApiTags('Pump Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pump')
export class PumpController {
  constructor(private readonly pumpService: PumpService) {}

  @Get('report/:deviceId')
  async getReport(
    @Param('deviceId') deviceId: string,
    @Query() query: PumpReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'excel') {
      // Phase 6 handles this
      const buffer = await this.pumpService.getReportExcel(deviceId, query);
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=pump-report-${deviceId}.xlsx`,
      });
      return res.send(buffer);
    }

    return this.pumpService.getReport(deviceId, query);
  }
}
```

### Step 3: Add auto-granularity helper to PumpService

Add private method to `src/pump/pump.service.ts`:

```typescript
import { TimeBucket } from 'src/sensor/enums/time-bucket.enum';

private getAutoGranularity(from: Date, to: Date): TimeBucket {
  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 2) return TimeBucket.HOUR;
  if (diffDays <= 60) return TimeBucket.DAY;
  if (diffDays <= 365) return TimeBucket.WEEK;
  return TimeBucket.MONTH;
}
```

### Step 4: Implement getReport

Add to `src/pump/pump.service.ts`:

```typescript
async getReport(deviceId: string, query: PumpReportQueryDto) {
  const from = query.from ? new Date(query.from) : new Date(0);
  const to = query.to ? new Date(query.to) : new Date();

  const [summary, maintenanceInfo, timeline, sessions] = await Promise.all([
    this.getSummary(deviceId, from, to),
    this.getMaintenanceInfo(deviceId),
    this.getTimeline(deviceId, from, to),
    this.getSessions(deviceId, from, to),
  ]);

  return { summary, maintenanceInfo, timeline, sessions };
}
```

### Step 5: Implement getSummary

```typescript
private async getSummary(deviceId: string, from: Date, to: Date) {
  const result = await this.pumpSessionRepo
    .createQueryBuilder('ps')
    .select('COUNT(*)', 'totalSessions')
    .addSelect('SUM(ps.durationSeconds)', 'totalDurationSeconds')
    .addSelect('AVG(ps.durationSeconds)', 'avgDurationSeconds')
    .addSelect('SUM(ps.flowTotal)', 'totalFlow')
    .addSelect('MIN(ps.tempMin)', 'tempMin')
    .addSelect('MAX(ps.tempMax)', 'tempMax')
    .addSelect('MIN(ps.pressureMin)', 'pressureMin')
    .addSelect('MAX(ps.pressureMax)', 'pressureMax')
    .addSelect('MIN(ps.currentMin)', 'currentMin')
    .addSelect('MAX(ps.currentMax)', 'currentMax')
    .addSelect(
      'SUM(CASE WHEN ps.overcurrentDetected = true THEN 1 ELSE 0 END)',
      'overcurrentSessions',
    )
    .addSelect('SUM(ps.overcurrentCount)', 'overcurrentTotalCount')
    .where('ps.deviceId = :deviceId', { deviceId })
    .andWhere('ps.startedAt >= :from', { from })
    .andWhere('ps.startedAt <= :to', { to })
    .getRawOne();

  const totalSeconds = parseFloat(result.totalDurationSeconds) || 0;

  return {
    totalSessions: parseInt(result.totalSessions, 10),
    totalDurationHours: +(totalSeconds / 3600).toFixed(2),
    avgDurationMinutes: +(
      (parseFloat(result.avgDurationSeconds) || 0) / 60
    ).toFixed(1),
    totalFlow: parseFloat(result.totalFlow) || 0,
    tempRange: {
      min: parseFloat(result.tempMin) ?? null,
      max: parseFloat(result.tempMax) ?? null,
    },
    pressureRange: {
      min: parseFloat(result.pressureMin) ?? null,
      max: parseFloat(result.pressureMax) ?? null,
    },
    currentRange: {
      min: parseFloat(result.currentMin) ?? null,
      max: parseFloat(result.currentMax) ?? null,
    },
    overcurrentSessions: parseInt(result.overcurrentSessions, 10) || 0,
    overcurrentTotalCount: parseInt(result.overcurrentTotalCount, 10) || 0,
  };
}
```

### Step 6: Implement getMaintenanceInfo

```typescript
private async getMaintenanceInfo(deviceId: string) {
  const device = await this.deviceRepo.findOne({ where: { id: deviceId } });

  if (!device) return null;

  const totalHours = device.totalOperatingHours || 0;
  const lifeHours = device.operatingLifeHours;

  if (!lifeHours) {
    return {
      operatingLifeHours: null,
      totalOperatingHours: totalHours,
      usagePercent: null,
      warningThreshold: 80,
      isWarning: false,
      isRequired: false,
    };
  }

  const usagePercent = +((totalHours / lifeHours) * 100).toFixed(1);

  return {
    operatingLifeHours: lifeHours,
    totalOperatingHours: +totalHours.toFixed(2),
    usagePercent,
    warningThreshold: 80,
    isWarning: usagePercent >= 80,
    isRequired: usagePercent >= 100,
  };
}
```

### Step 7: Implement getTimeline

```typescript
private async getTimeline(deviceId: string, from: Date, to: Date) {
  const bucket = this.getAutoGranularity(from, to);

  const rows = await this.pumpSessionRepo
    .createQueryBuilder('ps')
    .select(`DATE_TRUNC(:bucket, ps.startedAt)`, 'bucket')
    .addSelect('COUNT(*)', 'sessionCount')
    .addSelect('SUM(ps.durationSeconds)', 'totalDurationSeconds')
    .addSelect('AVG(ps.durationSeconds)', 'avgDurationSeconds')
    .addSelect('SUM(ps.flowTotal)', 'totalFlow')
    .setParameter('bucket', bucket)
    .where('ps.deviceId = :deviceId', { deviceId })
    .andWhere('ps.startedAt >= :from', { from })
    .andWhere('ps.startedAt <= :to', { to })
    .groupBy('bucket')
    .orderBy('bucket', 'ASC')
    .getRawMany();

  return {
    granularity: bucket,
    data: rows.map((r) => ({
      bucket: r.bucket,
      sessionCount: parseInt(r.sessionCount, 10),
      totalDurationMinutes: +(
        (parseFloat(r.totalDurationSeconds) || 0) / 60
      ).toFixed(1),
      avgDurationMinutes: +(
        (parseFloat(r.avgDurationSeconds) || 0) / 60
      ).toFixed(1),
      totalFlow: parseFloat(r.totalFlow) || 0,
    })),
  };
}
```

### Step 8: Implement getSessions

```typescript
private async getSessions(deviceId: string, from: Date, to: Date) {
  return this.pumpSessionRepo.find({
    where: {
      deviceId,
      startedAt: MoreThanOrEqual(from),
    },
    order: { startedAt: 'DESC' },
    take: 100,
  });
}
```

Add import at top of file:

```typescript
import { Repository, MoreThanOrEqual } from 'typeorm';
```

### Step 9: Add placeholder for getReportExcel (Phase 6)

```typescript
async getReportExcel(
  deviceId: string,
  query: PumpReportQueryDto,
): Promise<Buffer> {
  // Implemented in Phase 6
  throw new Error('Excel export not yet implemented');
}
```

## Todo List

- [ ] Create `src/pump/dto/pump-report-query.dto.ts`
- [ ] Add `getReport` endpoint to `PumpController`
- [ ] Implement `getAutoGranularity()` helper
- [ ] Implement `getReport()` orchestrator
- [ ] Implement `getSummary()` with aggregate SQL
- [ ] Implement `getMaintenanceInfo()` with usage percent
- [ ] Implement `getTimeline()` with DATE_TRUNC
- [ ] Implement `getSessions()` with pagination
- [ ] Add `getReportExcel()` placeholder
- [ ] Run `yarn build` to verify compilation
- [ ] Manual test: call GET /api/pump/report/:deviceId with valid dates

## Success Criteria

- `GET /api/pump/report/:deviceId` returns full JSON with summary, maintenanceInfo, timeline, sessions
- Auto granularity selects correct bucket based on date range
- Summary aggregates are computed server-side via SQL (not in-memory)
- maintenanceInfo.isWarning = true when usage >= 80%
- Timeline buckets are correctly ordered ASC
- Empty date range returns zeroed summary and empty arrays

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| getSummary returns NaN for empty dataset | Medium | All parseFloat calls fallback to 0 or null |
| Timeline query slow for large date ranges | Low | PumpSession table is small compared to SensorData; startedAt is indexed |
| Excel format requested before Phase 6 | Low | Throws explicit error; controller checks format param |
