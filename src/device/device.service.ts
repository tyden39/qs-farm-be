import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Device } from './entities/device.entity';
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

    return this.deviceRepository.save(device);
  }

  async remove(id: string) {
    const device = await this.findOne(id);

    return this.deviceRepository.remove(device);
  }
}
