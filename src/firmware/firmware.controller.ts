import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';

import { FirmwareService } from './firmware.service';
import { UploadFirmwareDto } from './dto/upload-firmware.dto';
import { UpdateFirmwareDto } from './dto/update-firmware.dto';
import { CheckUpdateQueryDto } from './dto/check-update-query.dto';
import { DeployFirmwareDto } from './dto/deploy-firmware.dto';
import { FirmwareReportDto } from './dto/firmware-report.dto';
import { QueryFirmwareLogDto } from './dto/query-firmware-log.dto';
import { FirmwareUpdateStatus } from './entities/firmware-update-log.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@ApiTags('Firmware')
@Controller('firmware')
export class FirmwareController {
  private readonly logger = new Logger(FirmwareController.name);

  constructor(private readonly firmwareService: FirmwareService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFirmwareDto,
    @CurrentUser() user: any,
  ) {
    return this.firmwareService.upload(file, dto, user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async findAll(
    @Query('hardwareModel') hardwareModel?: string,
    @Query('targetType') targetType?: 'device' | 'gateway',
  ) {
    return this.firmwareService.findAll(hardwareModel, targetType);
  }

  @Get('check')
  async checkForUpdate(@Query() query: CheckUpdateQueryDto) {
    return this.firmwareService.checkForUpdate(query);
  }

  @Post('report')
  async report(@Body() dto: FirmwareReportDto) {
    const target = dto.gatewayId
      ? `gateway=${dto.gatewayId}`
      : `device=${dto.deviceId}`;
    this.logger.log(
      `OTA report: ${target} version=${dto.version} status=${dto.status}`,
    );
    return this.firmwareService.handleUpdateReport({
      deviceId: dto.deviceId,
      gatewayId: dto.gatewayId,
      version: dto.version,
      success: dto.status === FirmwareUpdateStatus.SUCCESS,
      errorMessage: dto.errorMessage,
      duration: dto.duration,
      previousVersion: dto.previousVersion,
    });
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getLogs(@Query() query: QueryFirmwareLogDto) {
    return this.firmwareService.getUpdateLogs({
      deviceId: query.deviceId,
      firmwareId: query.firmwareId,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('download/:id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const firmware = await this.firmwareService.findOne(id);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': firmware.fileSize.toString(),
      'Content-MD5': firmware.checksum,
      'Content-Disposition': `attachment; filename="firmware-${firmware.version}.bin"`,
    });

    const stream = createReadStream(firmware.filePath);
    stream.pipe(res);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async findOne(@Param('id') id: string) {
    return this.firmwareService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() dto: UpdateFirmwareDto) {
    return this.firmwareService.update(id, dto);
  }

  @Post(':id/deploy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deploy(@Param('id') id: string, @Body() dto: DeployFirmwareDto) {
    return this.firmwareService.deploy(id, dto);
  }

  @Post(':id/deploy-gateways')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deployGateways(
    @Param('id') id: string,
    @Body() dto: DeployFirmwareDto,
    @CurrentUser() user: any,
  ) {
    return this.firmwareService.deployGatewaysForUser(id, dto, user.id);
  }

  @Get(':id/deploy-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getDeployStatus(@Param('id') firmwareId: string) {
    // Fetch all logs (high limit) for status counting
    const result = await this.firmwareService.getUpdateLogs({
      firmwareId,
      limit: 1000,
    });
    const logs = result.data;
    return {
      firmwareId,
      total: logs.length,
      success: logs.filter((l) => l.status === 'success').length,
      failed: logs.filter((l) => l.status === 'failed').length,
      pending: logs.filter((l) => l.status === 'pending').length,
      logs,
    };
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async publish(@Param('id') id: string) {
    return this.firmwareService.publish(id);
  }

  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async unpublish(@Param('id') id: string) {
    return this.firmwareService.unpublish(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.firmwareService.remove(id);
  }
}
