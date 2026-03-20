import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ZoneSensorConfig } from './entities/zone-sensor-config.entity';
import { ZoneThreshold } from './entities/zone-threshold.entity';
import { CreateZoneSensorConfigDto } from './dto/create-zone-sensor-config.dto';
import { UpdateZoneSensorConfigDto } from './dto/update-zone-sensor-config.dto';
import { CreateZoneThresholdDto } from './dto/create-zone-threshold.dto';
import { UpdateZoneThresholdDto } from './dto/update-zone-threshold.dto';
import { ConfigResolutionService } from './config-resolution.service';

@Injectable()
export class ZoneSensorConfigService {
  constructor(
    @InjectRepository(ZoneSensorConfig)
    private readonly configRepo: Repository<ZoneSensorConfig>,
    @InjectRepository(ZoneThreshold)
    private readonly thresholdRepo: Repository<ZoneThreshold>,
    private readonly configResolution: ConfigResolutionService,
  ) {}

  // --- ZoneSensorConfig CRUD ---

  async findAllByZone(zoneId: string): Promise<ZoneSensorConfig[]> {
    return this.configRepo.find({ where: { zoneId }, relations: ['thresholds'] });
  }

  async createConfig(zoneId: string, dto: CreateZoneSensorConfigDto): Promise<ZoneSensorConfig> {
    const config = this.configRepo.create({ ...dto, zoneId });
    const saved = await this.configRepo.save(config);
    this.configResolution.invalidateCacheByZone(zoneId);
    return saved;
  }

  async updateConfig(zoneId: string, id: string, dto: UpdateZoneSensorConfigDto): Promise<ZoneSensorConfig> {
    const config = await this.configRepo.findOne({ where: { id, zoneId } });
    if (!config) throw new NotFoundException(`Zone sensor config ${id} not found`);
    Object.assign(config, dto);
    const saved = await this.configRepo.save(config);
    this.configResolution.invalidateCacheByZone(zoneId);
    return saved;
  }

  async removeConfig(zoneId: string, id: string): Promise<void> {
    const config = await this.configRepo.findOne({ where: { id, zoneId } });
    if (!config) throw new NotFoundException(`Zone sensor config ${id} not found`);
    await this.configRepo.remove(config);
    this.configResolution.invalidateCacheByZone(zoneId);
  }

  // --- ZoneThreshold CRUD ---

  async findAllThresholds(configId: string): Promise<ZoneThreshold[]> {
    return this.thresholdRepo.find({ where: { zoneSensorConfigId: configId } });
  }

  async createThreshold(configId: string, dto: CreateZoneThresholdDto): Promise<ZoneThreshold> {
    const config = await this.configRepo.findOne({ where: { id: configId } });
    if (!config) throw new NotFoundException(`Zone sensor config ${configId} not found`);
    const threshold = this.thresholdRepo.create({ ...dto, zoneSensorConfigId: configId });
    const saved = await this.thresholdRepo.save(threshold);
    this.configResolution.invalidateCacheByZone(config.zoneId);
    return saved;
  }

  async updateThreshold(configId: string, id: string, dto: UpdateZoneThresholdDto): Promise<ZoneThreshold> {
    const threshold = await this.thresholdRepo.findOne({ where: { id, zoneSensorConfigId: configId } });
    if (!threshold) throw new NotFoundException(`Zone threshold ${id} not found`);
    const config = await this.configRepo.findOne({ where: { id: configId } });
    Object.assign(threshold, dto);
    const saved = await this.thresholdRepo.save(threshold);
    if (config) this.configResolution.invalidateCacheByZone(config.zoneId);
    return saved;
  }

  async removeThreshold(configId: string, id: string): Promise<void> {
    const threshold = await this.thresholdRepo.findOne({ where: { id, zoneSensorConfigId: configId } });
    if (!threshold) throw new NotFoundException(`Zone threshold ${id} not found`);
    const config = await this.configRepo.findOne({ where: { id: configId } });
    await this.thresholdRepo.remove(threshold);
    if (config) this.configResolution.invalidateCacheByZone(config.zoneId);
  }

  // --- Helper for config resolution (Phase 4) ---

  async getConfigsForZone(zoneId: string): Promise<ZoneSensorConfig[]> {
    return this.configRepo.find({ where: { zoneId }, relations: ['thresholds'] });
  }
}
