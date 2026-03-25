---
phase: 4
title: "Fertilizer Controller + Module"
status: pending
priority: P1
---

# Phase 4: Fertilizer Controller + Module

## Overview

Create the REST controller and NestJS module for the fertilizer feature.

## Context Files

- `src/pump/pump.controller.ts` — reference pattern
- `src/pump/pump.module.ts` — reference pattern

## Files to Create

### 1. `src/fertilizer/fertilizer.controller.ts`

Mirror `PumpController` with these differences:

```typescript
@ApiTags('Fertilizer Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fertilizer')
export class FertilizerController {
  constructor(private readonly fertilizerService: FertilizerService) {}

  @Get('report/:deviceId')
  @ApiOperation({
    summary: 'Get fertilizer session report',
    description: 'Returns fertilizer session history with summary, timeline, and sessions. Use format=excel for .xlsx download.',
  })
  @ApiParam({ name: 'deviceId', description: 'Device UUID', type: 'string' })
  @ApiProduces('application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiResponse({ status: 200, description: 'JSON report or Excel file' })
  async getReport(
    @Param('deviceId') deviceId: string,
    @Query() query: FertilizerReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'excel') {
      const buffer = await this.fertilizerService.getReportExcel(deviceId, query);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fertilizer-report-${deviceId}.xlsx`,
      });
      return res.send(buffer);
    }
    return this.fertilizerService.getReport(deviceId, query);
  }
}
```

**Swagger response example** (adapt from pump, remove maintenanceInfo/modeBreakdown/flow/pressure fields).

### 2. `src/fertilizer/fertilizer.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([FertilizerSession, Device, SensorData, AlertLog]),
    DeviceModule,
  ],
  controllers: [FertilizerController],
  providers: [FertilizerService],
  exports: [FertilizerService],
})
export class FertilizerModule {}
```

**Imports needed:**
- `TypeOrmModule` from `@nestjs/typeorm`
- `FertilizerSession` from `./entities/fertilizer-session.entity`
- `Device` from `src/device/entities/device.entity`
- `SensorData` from `src/sensor/entities/sensor-data.entity`
- `AlertLog` from `src/sensor/entities/alert-log.entity`
- `DeviceModule` from `src/device/device.module`

## Success Criteria

- [ ] Controller exposes `GET /fertilizer/report/:deviceId`
- [ ] Supports `?format=excel` query param
- [ ] Module registers all TypeORM entities and imports DeviceModule
- [ ] Swagger docs at `/api` show Fertilizer Sessions tag
- [ ] Project compiles
