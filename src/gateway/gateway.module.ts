import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Gateway } from './entities/gateway.entity';
import { GatewayService } from './gateway.service';
import { GatewayController } from './gateway.controller';
import { DeviceModule } from 'src/device/device.module';

@Module({
  imports: [TypeOrmModule.forFeature([Gateway]), DeviceModule],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService, TypeOrmModule],
})
export class GatewayModule {}
