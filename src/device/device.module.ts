import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { Device } from './entities/device.entity';
import { PairingToken } from './entities/pairing-token.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { CommandLog } from 'src/sensor/entities/command-log.entity';
import { SensorConfig } from 'src/sensor/entities/sensor-config.entity';
import { DeviceSchedule } from 'src/schedule/entities/device-schedule.entity';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { FilesModule } from 'src/files/files.module';
import { MqttService } from './mqtt/mqtt.service';
import { DeviceGateway } from './websocket/device.gateway';
import { SyncService } from './sync/sync.service';
import { ProvisionModule } from 'src/provision/provision.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Device,
      Zone,
      PairingToken,
      SensorData,
      AlertLog,
      CommandLog,
      SensorConfig,
      DeviceSchedule,
    ]),
    FilesModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRE },
    }),
    forwardRef(() => ProvisionModule),
    UserModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService, MqttService, DeviceGateway, SyncService],
  exports: [DeviceService, MqttService, DeviceGateway, SyncService],
})
export class DeviceModule {}
