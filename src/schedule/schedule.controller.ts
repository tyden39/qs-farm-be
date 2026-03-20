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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ScheduleService } from './schedule.service';
import { CreateDeviceScheduleDto } from './dto/create-device-schedule.dto';
import { UpdateDeviceScheduleDto } from './dto/update-device-schedule.dto';

@ApiTags('Schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'farmId', required: false })
  @ApiQuery({ name: 'zoneId', required: false })
  findAll(
    @Query('deviceId') deviceId?: string,
    @Query('farmId') farmId?: string,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.scheduleService.findAll(deviceId, farmId, zoneId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scheduleService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDeviceScheduleDto) {
    return this.scheduleService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceScheduleDto) {
    return this.scheduleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scheduleService.remove(id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.scheduleService.toggle(id);
  }
}
