import { Controller, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { DeviceToken } from './entities/device-token.entity';
import { RegisterTokenDto } from './dtos/register-token.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification')
export class NotificationController {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  @Post('register-token')
  async registerToken(@CurrentUser() user: any, @Body() dto: RegisterTokenDto) {
    // Upsert: if token exists, update userId (device may switch accounts)
    const existing = await this.deviceTokenRepo.findOne({
      where: { token: dto.token },
    });
    if (existing) {
      existing.userId = user.id;
      existing.platform = dto.platform;
      return this.deviceTokenRepo.save(existing);
    }
    return this.deviceTokenRepo.save(
      this.deviceTokenRepo.create({
        userId: user.id,
        token: dto.token,
        platform: dto.platform,
      }),
    );
  }

  @Delete('unregister-token')
  async unregisterToken(
    @CurrentUser() user: any,
    @Body() dto: RegisterTokenDto,
  ) {
    await this.deviceTokenRepo.delete({
      userId: user.id,
      token: dto.token,
    });
    return { message: 'Token unregistered' };
  }
}
