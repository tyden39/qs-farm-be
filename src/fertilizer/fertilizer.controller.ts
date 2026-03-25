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
import { FertilizerService } from './fertilizer.service';
import { FertilizerReportQueryDto } from './dto/fertilizer-report-query.dto';

@ApiTags('Fertilizer Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fertilizer')
export class FertilizerController {
  constructor(private readonly fertilizerService: FertilizerService) {}

  @Get('report/:deviceId')
  @ApiOperation({
    summary: 'Get fertilizer session report',
    description:
      'Returns fertilizer session history with summary stats, timeline, and per-session details. Use `format=excel` to download as .xlsx file.',
  })
  @ApiParam({ name: 'deviceId', description: 'Device UUID', type: 'string' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({
    status: 200,
    description: 'JSON report with summary, timeline, and sessions list.',
    schema: {
      example: {
        summary: {
          totalSessions: 8,
          totalDurationHours: 2.4,
          avgDurationMinutes: 18.0,
          tempRange: { min: 30.2, max: 45.1 },
          currentRange: { min: 0.5, max: 3.8 },
          overcurrentSessions: 0,
          overcurrentTotalCount: 0,
        },
        timeline: {
          granularity: 'day',
          data: [
            {
              bucket: '2026-03-01T00:00:00.000Z',
              sessionCount: 2,
              totalDurationMinutes: 36.0,
              avgDurationMinutes: 18.0,
            },
          ],
        },
        sessions: [
          {
            id: 'uuid',
            deviceId: 'uuid',
            sessionNumber: 8,
            controlMode: 'manual',
            startedAt: '2026-03-18T08:00:00.000Z',
            endedAt: '2026-03-18T08:18:00.000Z',
            durationSeconds: 1080,
            status: 'completed',
          },
        ],
      },
    },
  })
  async getReport(
    @Param('deviceId') deviceId: string,
    @Query() query: FertilizerReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'excel') {
      const buffer = await this.fertilizerService.getReportExcel(
        deviceId,
        query,
      );
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fertilizer-report-${deviceId}.xlsx`,
      });
      return res.send(buffer);
    }

    return this.fertilizerService.getReport(deviceId, query);
  }
}
