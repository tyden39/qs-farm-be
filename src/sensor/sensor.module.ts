import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceModule } from 'src/device/device.module';
import { Device } from 'src/device/entities/device.entity';
import { SensorConfig } from './entities/sensor-config.entity';
import { SensorThreshold } from './entities/sensor-threshold.entity';
import { SensorData } from './entities/sensor-data.entity';
import { AlertLog } from './entities/alert-log.entity';
import { CommandLog } from './entities/command-log.entity';
import { SensorService } from './sensor.service';
import { SensorController } from './sensor.controller';
import { ThresholdService } from './threshold.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SensorConfig,
      SensorThreshold,
      SensorData,
      AlertLog,
      CommandLog,
      Device,
    ]),
    DeviceModule,
  ],
  controllers: [SensorController],
  providers: [SensorService, ThresholdService],
  exports: [SensorService],
})
export class SensorModule {}
