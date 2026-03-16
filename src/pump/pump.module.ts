import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PumpSession } from './entities/pump-session.entity';
import { Device } from 'src/device/entities/device.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { DeviceModule } from 'src/device/device.module';
import { PumpService } from './pump.service';
import { PumpController } from './pump.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PumpSession, Device, SensorData, AlertLog]),
    DeviceModule,
  ],
  controllers: [PumpController],
  providers: [PumpService],
  exports: [PumpService],
})
export class PumpModule {}
