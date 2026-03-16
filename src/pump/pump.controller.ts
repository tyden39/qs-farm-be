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
