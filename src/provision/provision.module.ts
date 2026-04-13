import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvisionService } from './provision.service';
import { ProvisionController } from './provision.controller';
import { Device } from 'src/device/entities/device.entity';
import { PairingToken } from 'src/device/entities/pairing-token.entity';
import { Gateway } from 'src/gateway/entities/gateway.entity';
import { DeviceModule } from 'src/device/device.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device, PairingToken, Gateway]), forwardRef(() => DeviceModule)],
  providers: [ProvisionService],
  controllers: [ProvisionController],
  exports: [ProvisionService],
})
export class ProvisionModule {}
