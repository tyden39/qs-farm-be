import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Zone } from './entities/zone.entity';
import { ZoneSensorConfig } from './entities/zone-sensor-config.entity';
import { ZoneThreshold } from './entities/zone-threshold.entity';
import { Device } from 'src/device/entities/device.entity';
import { FilesModule } from 'src/files/files.module';
import { DeviceModule } from 'src/device/device.module';
import { ZoneService } from './zone.service';
import { ZoneSensorConfigService } from './zone-sensor-config.service';
import { ConfigResolutionService } from './config-resolution.service';
import { ZoneController } from './zone.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Zone, ZoneSensorConfig, ZoneThreshold, Device]),
    FilesModule,
    DeviceModule,
  ],
  controllers: [ZoneController],
  providers: [ZoneService, ZoneSensorConfigService, ConfigResolutionService],
  exports: [ZoneService, ZoneSensorConfigService, ConfigResolutionService],
})
export class ZoneModule {}
