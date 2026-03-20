import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesService } from 'src/files/files.service';
import { ZoneService } from './zone.service';
import { ZoneSensorConfigService } from './zone-sensor-config.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateZoneSensorConfigDto } from './dto/create-zone-sensor-config.dto';
import { UpdateZoneSensorConfigDto } from './dto/update-zone-sensor-config.dto';
import { CreateZoneThresholdDto } from './dto/create-zone-threshold.dto';
import { UpdateZoneThresholdDto } from './dto/update-zone-threshold.dto';

@ApiTags('Zones')
@Controller('zone')
export class ZoneController {
  constructor(
    private readonly zoneService: ZoneService,
    private readonly zoneSensorConfigService: ZoneSensorConfigService,
    private readonly filesService: FilesService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  async findAll(@Query('farmId') farmId: string) {
    return this.zoneService.findAllByFarm(farmId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.zoneService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  async create(@Body() dto: CreateZoneDto) {
    return this.zoneService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async createWithUpload(
    @Body() body: Omit<CreateZoneDto, 'image'>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = '';
    if (file) {
      const uploadedFile = await this.filesService.create(file);
      imageUrl = uploadedFile.file.path;
    }
    return this.zoneService.create({ ...body, image: imageUrl });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zoneService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.zoneService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/pump')
  async togglePump(
    @Param('id') id: string,
    @Body() body: { action: 'PUMP_ON' | 'PUMP_OFF' },
  ) {
    return this.zoneService.togglePump(id, body.action);
  }

  // --- Zone Sensor Config ---

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':zoneId/sensor-config')
  async findSensorConfigs(@Param('zoneId') zoneId: string) {
    return this.zoneSensorConfigService.findAllByZone(zoneId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':zoneId/sensor-config')
  async createSensorConfig(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateZoneSensorConfigDto,
  ) {
    return this.zoneSensorConfigService.createConfig(zoneId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':zoneId/sensor-config/:configId')
  async updateSensorConfig(
    @Param('zoneId') zoneId: string,
    @Param('configId') configId: string,
    @Body() dto: UpdateZoneSensorConfigDto,
  ) {
    return this.zoneSensorConfigService.updateConfig(zoneId, configId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':zoneId/sensor-config/:configId')
  async removeSensorConfig(
    @Param('zoneId') zoneId: string,
    @Param('configId') configId: string,
  ) {
    return this.zoneSensorConfigService.removeConfig(zoneId, configId);
  }

  // --- Zone Threshold ---

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':zoneId/sensor-config/:configId/threshold')
  async findThresholds(@Param('configId') configId: string) {
    return this.zoneSensorConfigService.findAllThresholds(configId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':zoneId/sensor-config/:configId/threshold')
  async createThreshold(
    @Param('configId') configId: string,
    @Body() dto: CreateZoneThresholdDto,
  ) {
    return this.zoneSensorConfigService.createThreshold(configId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':zoneId/sensor-config/:configId/threshold/:thresholdId')
  async updateThreshold(
    @Param('configId') configId: string,
    @Param('thresholdId') thresholdId: string,
    @Body() dto: UpdateZoneThresholdDto,
  ) {
    return this.zoneSensorConfigService.updateThreshold(configId, thresholdId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':zoneId/sensor-config/:configId/threshold/:thresholdId')
  async removeThreshold(
    @Param('configId') configId: string,
    @Param('thresholdId') thresholdId: string,
  ) {
    return this.zoneSensorConfigService.removeThreshold(configId, thresholdId);
  }
}
