import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get pump session report',
    description:
      'Returns pump session history with summary stats, maintenance info, timeline, and per-session details. Use `format=excel` to download as .xlsx file.',
  })
  @ApiParam({ name: 'deviceId', description: 'Device UUID', type: 'string' })
  @ApiProduces('application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiResponse({
    status: 200,
    description: 'JSON report (default). `summary.modeBreakdown` shows session counts by irrigation mode (normal/spray/root/drip). Each session includes `irrigationMode` and `controlMode` fields.',
    schema: {
      example: {
        summary: {
          totalSessions: 10,
          totalDurationHours: 5.2,
          avgDurationMinutes: 31.2,
          totalFlow: 120.5,
          tempRange: { min: 28.1, max: 42.3 },
          pressureRange: { min: 1.2, max: 3.5 },
          currentRange: { min: 0.8, max: 4.2 },
          overcurrentSessions: 1,
          overcurrentTotalCount: 2,
          modeBreakdown: [
            { mode: 'drip', count: 5 },
            { mode: 'normal', count: 3 },
            { mode: 'spray', count: 2 },
          ],
        },
        maintenanceInfo: {
          operatingLifeHours: 500,
          totalOperatingHours: 412.5,
          usagePercent: 82.5,
          warningThreshold: 80,
          isWarning: true,
          isRequired: false,
        },
        timeline: {
          granularity: 'day',
          data: [
            {
              bucket: '2026-03-01T00:00:00.000Z',
              sessionCount: 3,
              totalDurationMinutes: 90.0,
              avgDurationMinutes: 30.0,
              totalFlow: 36.0,
            },
          ],
        },
        sessions: [
          {
            id: 'uuid',
            deviceId: 'uuid',
            sessionNumber: 10,
            irrigationMode: 'drip',
            controlMode: 'manual',
            startedAt: '2026-03-18T08:00:00.000Z',
            endedAt: '2026-03-18T08:30:00.000Z',
            durationSeconds: 1800,
            status: 'completed',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Excel file download when `format=excel`. Includes "Operation Mode" column with Vietnamese labels (Bình thường / Phun mưa / Tưới gốc / Nhỏ giọt).',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  async getReport(
    @Param('deviceId') deviceId: string,
    @Query() query: PumpReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'excel') {
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
