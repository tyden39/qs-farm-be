import { Controller, Delete, Get, HttpCode, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GatewayService } from './gateway.service';
import { PairGatewayDto } from './dto/pair-gateway.dto';

@ApiTags('Gateways')
@Controller()
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('provision/gateway/pair')
  async pairGateway(@Body() dto: PairGatewayDto) {
    return this.gatewayService.pairGateway(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('gateways')
  async findByFarm(@Query('farmId') farmId: string) {
    return this.gatewayService.findByFarm(farmId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('gateways/:id')
  async findOne(@Param('id') id: string) {
    return this.gatewayService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('gateways/:id')
  @HttpCode(204)
  async deleteGateway(@Param('id') id: string) {
    return this.gatewayService.deleteGateway(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('gateways/:id/devices')
  async findDevicesByGateway(@Param('id') id: string) {
    return this.gatewayService.findDevicesByGateway(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('gateways/:id/status')
  async getGatewayStatus(@Param('id') id: string) {
    const gateway = await this.gatewayService.findOne(id);
    return {
      gatewayId: id,
      serial: gateway.serial,
      status: gateway.status,
      online: this.gatewayService.isGatewayOnline(gateway),
      lastSeenAt: gateway.lastSeenAt,
      firmwareVersion: gateway.firmwareVersion,
    };
  }
}
