import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvisionService } from './provision.service';
import { ProvisionController } from './provision.controller';
import { Device } from 'src/device/entities/device.entity';
import { PairingToken } from 'src/device/entities/pairing-token.entity';
import { Gateway } from 'src/gateway/entities/gateway.entity';
import { MqttService } from 'src/device/mqtt/mqtt.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device, PairingToken, Gateway])],
  providers: [ProvisionService, MqttService],
  controllers: [ProvisionController],
  exports: [ProvisionService],
})
export class ProvisionModule {}
