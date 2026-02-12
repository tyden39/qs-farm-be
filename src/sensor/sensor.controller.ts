import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SensorService } from './sensor.service';
import { CreateSensorConfigDto } from './dto/create-sensor-config.dto';
import { UpdateSensorConfigDto } from './dto/update-sensor-config.dto';
import { CreateSensorThresholdDto } from './dto/create-sensor-threshold.dto';
import { UpdateSensorThresholdDto } from './dto/update-sensor-threshold.dto';
import { QuerySensorDataDto } from './dto/query-sensor-data.dto';
import { QueryAlertLogDto } from './dto/query-alert-log.dto';

@ApiTags('Sensors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sensor')
export class SensorController {
  constructor(private readonly sensorService: SensorService) {}

  // --- Sensor Config ---

  @Get('device/:deviceId/config')
  findAllConfigs(@Param('deviceId') deviceId: string) {
    return this.sensorService.findAllConfigs(deviceId);
  }

  @Post('device/:deviceId/config')
  createConfig(
    @Param('deviceId') deviceId: string,
    @Body() dto: CreateSensorConfigDto,
  ) {
    return this.sensorService.createConfig(deviceId, dto);
  }

  @Patch('device/:deviceId/config/:id')
  updateConfig(
    @Param('deviceId') deviceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSensorConfigDto,
  ) {
    return this.sensorService.updateConfig(deviceId, id, dto);
  }

  @Delete('device/:deviceId/config/:id')
  removeConfig(
    @Param('deviceId') deviceId: string,
    @Param('id') id: string,
  ) {
    return this.sensorService.removeConfig(deviceId, id);
  }

  // --- Sensor Thresholds ---

  @Get('config/:configId/threshold')
  findAllThresholds(@Param('configId') configId: string) {
    return this.sensorService.findAllThresholds(configId);
  }

  @Post('config/:configId/threshold')
  createThreshold(
    @Param('configId') configId: string,
    @Body() dto: CreateSensorThresholdDto,
  ) {
    return this.sensorService.createThreshold(configId, dto);
  }

  @Patch('config/:configId/threshold/:id')
  updateThreshold(
    @Param('configId') configId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSensorThresholdDto,
  ) {
    return this.sensorService.updateThreshold(configId, id, dto);
  }

  @Delete('config/:configId/threshold/:id')
  removeThreshold(
    @Param('configId') configId: string,
    @Param('id') id: string,
  ) {
    return this.sensorService.removeThreshold(configId, id);
  }

  // --- Sensor Data ---

  @Get('device/:deviceId/data')
  findSensorData(
    @Param('deviceId') deviceId: string,
    @Query() query: QuerySensorDataDto,
  ) {
    return this.sensorService.findSensorData(deviceId, query);
  }

  @Get('device/:deviceId/data/latest')
  findLatestSensorData(@Param('deviceId') deviceId: string) {
    return this.sensorService.findLatestSensorData(deviceId);
  }

  // --- Alerts ---

  @Get('device/:deviceId/alerts')
  findAlerts(
    @Param('deviceId') deviceId: string,
    @Query() query: QueryAlertLogDto,
  ) {
    return this.sensorService.findAlerts(deviceId, query);
  }

  @Patch('device/:deviceId/alerts/:id/acknowledge')
  acknowledgeAlert(
    @Param('deviceId') deviceId: string,
    @Param('id') id: string,
  ) {
    return this.sensorService.acknowledgeAlert(deviceId, id);
  }
}
