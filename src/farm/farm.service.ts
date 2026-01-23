import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Farm } from './entities/farm.entity';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';

@Injectable()
export class FarmService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,
  ) {}

  async findAll(userId?: string) {
    const where = userId ? { userId } : {};
    const farms = await this.farmRepository.find({
      where,
      relations: ['devices'],
    });

    return farms;
  }

  async findOne(id: string) {
    const farm = await this.farmRepository.findOne(id, {
      relations: ['devices', 'user'],
    });

    if (!farm) {
      throw new NotFoundException(`There is no farm under id ${id}`);
    }

    return farm;
  }

  async create(createFarmDto: CreateFarmDto, userId: string) {
    const farm = await this.farmRepository.create({
      ...createFarmDto,
      userId,
    });

    return this.farmRepository.save(farm);
  }

  async update(id: string, updateFarmDto: UpdateFarmDto) {
    const farm = await this.farmRepository.preload({
      id,
      ...updateFarmDto,
    });

    if (!farm) {
      throw new NotFoundException(`There is no farm under id ${id}`);
    }

    return this.farmRepository.save(farm);
  }

  async remove(id: string) {
    const farm = await this.findOne(id);

    return this.farmRepository.remove(farm);
  }
}
