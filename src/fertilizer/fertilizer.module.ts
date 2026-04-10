import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FertilizerSession } from './entities/fertilizer-session.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { Device } from 'src/device/entities/device.entity';
import { DeviceModule } from 'src/device/device.module';
import { FertilizerService } from './fertilizer.service';
import { FertilizerController } from './fertilizer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FertilizerSession, SensorData, AlertLog, Device]),
    DeviceModule,
  ],
  controllers: [FertilizerController],
  providers: [FertilizerService],
  exports: [FertilizerService],
})
export class FertilizerModule {}
