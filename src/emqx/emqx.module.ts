import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EmqxController } from './emqx.controller';
import { EmqxService } from './emqx.service';
import { Device } from 'src/device/entities/device.entity';
import { Farm } from 'src/farm/entities/farm.entity';
import { Gateway } from 'src/gateway/entities/gateway.entity';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Farm, Gateway]),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
    UserModule,
  ],
  controllers: [EmqxController],
  providers: [EmqxService],
  exports: [EmqxService],
})
export class EmqxModule {}
