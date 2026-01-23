import { Controller, Post, Body, UseGuards, Param, Get, Logger } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { ProvisionService, PairDeviceDto } from './provision.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@ApiTags('Provisioning')
@Controller('provision')
export class ProvisionController {
  private readonly logger = new Logger(ProvisionController.name);

  constructor(private readonly provisionService: ProvisionService) {}

  /**
   * Get pairing status for a device
   */
  @Get('status/:serial')
  @ApiResponse({ status: 200, description: 'Pairing status' })
  async getStatus(@Param('serial') serial: string) {
    return this.provisionService.getPairingStatus(serial);
  }

  /**
   * Pair device to farm (called from mobile app after user inputs serial)
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('pair')
  @ApiBody({ type: PairDeviceDto })
  @ApiResponse({ status: 200, description: 'Device paired successfully' })
  async pairDevice(
    @CurrentUser() user: any,
    @Body() dto: PairDeviceDto,
  ) {
    return this.provisionService.pairDevice(user.id, dto);
  }

  /**
   * Unpair device from farm
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':deviceId/unpair')
  @ApiResponse({ status: 200, description: 'Device unpaired successfully' })
  async unpairDevice(@Param('deviceId') deviceId: string) {
    return this.provisionService.unpairDevice(deviceId);
  }

  /**
   * Regenerate device token
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':deviceId/regenerate-token')
  @ApiResponse({ status: 200, description: 'Token regenerated successfully' })
  async regenerateToken(@Param('deviceId') deviceId: string) {
    return this.provisionService.regenerateDeviceToken(deviceId);
  }
}
