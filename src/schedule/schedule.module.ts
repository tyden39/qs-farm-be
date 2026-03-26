import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';

import { DeviceSchedule } from './entities/device-schedule.entity';
import { Farm } from 'src/farm/entities/farm.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { Device } from 'src/device/entities/device.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { DeviceModule } from 'src/device/device.module';
import { NotificationModule } from 'src/notification/notification.module';
import { ZoneModule } from 'src/zone/zone.module';

@Module({
  imports: [
    NestScheduleModule.forRoot(),
    TypeOrmModule.forFeature([DeviceSchedule, Farm, Zone, Device]),
    DeviceModule,
    NotificationModule,
    ZoneModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
