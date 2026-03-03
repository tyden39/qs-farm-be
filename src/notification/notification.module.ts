import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceToken } from './entities/device-token.entity';
import { FcmService } from './fcm.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken])],
  controllers: [NotificationController],
  providers: [FcmService],
  exports: [FcmService],
})
export class NotificationModule {}
