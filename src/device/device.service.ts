import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Device, DeviceStatus } from './entities/device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async findAll(farmId?: string) {
    const where = farmId ? { farmId } : {};
    const devices = await this.deviceRepository.find({
      where,
      relations: ['farm'],
    });

    return devices;
  }

  async findOne(id: string) {
    const device = await this.deviceRepository.findOne(id, {
      relations: ['farm', 'farm.user'],
    });

    if (!device) {
      throw new NotFoundException(`There is no device under id ${id}`);
    }

    // Validate deviceToken is required for paired/active devices
    if (
      (device.status === DeviceStatus.PAIRED ||
        device.status === DeviceStatus.ACTIVE) &&
      !device.deviceToken
    ) {
      throw new BadRequestException(
        `Device ${id} is missing required deviceToken for status: ${device.status}`,
      );
    }

    return device;
  }

  async create(createDeviceDto: CreateDeviceDto, farmId: string) {
    const device = await this.deviceRepository.create({
      ...createDeviceDto,
      farmId,
    });

    return this.deviceRepository.save(device);
  }

  async update(id: string, updateDeviceDto: UpdateDeviceDto) {
    const device = await this.deviceRepository.preload({
      id,
      ...updateDeviceDto,
    });

    if (!device) {
      throw new NotFoundException(`There is no device under id ${id}`);
    }

    // Validate deviceToken is required for paired/active devices
    if (
      (device.status === DeviceStatus.PAIRED ||
        device.status === DeviceStatus.ACTIVE) &&
      !device.deviceToken
    ) {
      throw new BadRequestException(
        `Device token is required for devices with status: ${device.status}`,
      );
    }

    return this.deviceRepository.save(device);
  }

  async remove(id: string) {
    const device = await this.findOne(id);

    return this.deviceRepository.remove(device);
  }
}
