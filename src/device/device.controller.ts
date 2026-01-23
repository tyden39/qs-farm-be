import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { DeviceService } from './device.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesService } from 'src/files/files.service';
import { SyncService } from './sync/sync.service';
import { ProvisionService } from 'src/provision/provision.service';

@ApiTags('Devices')
@Controller('device')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly filesService: FilesService,
    private readonly syncService: SyncService,
    private readonly provisionService: ProvisionService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  async findAll(@Query('farmId') farmId?: string) {
    return this.deviceService.findAll(farmId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.deviceService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  async create(
    @Body() createDeviceDto: CreateDeviceDto,
  ) {
    return this.deviceService.create(createDeviceDto, createDeviceDto.farmId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        imei: { type: 'string' },
        serial: { type: 'string' },
        hardwareVersion: { type: 'string' },
        farmId: { type: 'string', format: 'uuid' },
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['name', 'imei', 'farmId'],
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async createWithUpload(
    @Body('name') name: string,
    @Body('imei') imei: string,
    @Body('serial') serial: string,
    @Body('hardwareVersion') hardwareVersion: string,
    @Body('farmId') farmId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = '';

    if (file) {
      const uploadedFile = await this.filesService.create(file);
      imageUrl = uploadedFile.file.path;
    }

    return this.deviceService.create(
      {
        name,
        imei,
        serial,
        hardwareVersion,
        farmId,
        image: imageUrl,
      },
      farmId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    return this.deviceService.update(id, updateDeviceDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.deviceService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/command')
  async sendCommand(
    @Param('id') id: string,
    @Body() body: { command: string; params?: any },
  ) {
    const device = await this.deviceService.findOne(id);

    return this.syncService.sendCommandToDevice(
      device.id,
      body.command,
      body.params || {},
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/status')
  async getDeviceStatus(@Param('id') id: string) {
    const device = await this.deviceService.findOne(id);
    const isOnline = await this.syncService.isDeviceOnline(device.id);

    return {
      deviceId: id,
      imei: device.imei,
      serial: device.serial,
      status: device.status,
      online: isOnline,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/regenerate-token')
  async regenerateToken(@Param('id') id: string) {
    return this.provisionService.regenerateDeviceToken(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/unpair')
  async unpairDevice(@Param('id') id: string) {
    return this.provisionService.unpairDevice(id);
  }
}
