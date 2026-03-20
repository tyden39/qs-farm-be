import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Zone } from './entities/zone.entity';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ConfigResolutionService } from './config-resolution.service';
import { SyncService } from 'src/device/sync/sync.service';

@Injectable()
export class ZoneService {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepo: Repository<Zone>,
    private readonly configResolution: ConfigResolutionService,
    private readonly syncService: SyncService,
  ) {}

  async findAllByFarm(farmId: string): Promise<Zone[]> {
    return this.zoneRepo.find({ where: { farmId } });
  }

  async findOne(id: string): Promise<Zone> {
    const zone = await this.zoneRepo.findOne({
      where: { id },
      relations: ['devices', 'sensorConfigs'],
    });
    if (!zone) throw new NotFoundException(`Zone ${id} not found`);
    return zone;
  }

  async create(dto: CreateZoneDto): Promise<Zone> {
    const zone = this.zoneRepo.create(dto);
    return this.zoneRepo.save(zone);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<Zone> {
    const zone = await this.zoneRepo.preload({ id, ...dto });
    if (!zone) throw new NotFoundException(`Zone ${id} not found`);
    const saved = await this.zoneRepo.save(zone);
    // Invalidate resolution cache for all devices in this zone
    this.configResolution.invalidateCacheByZone(id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const zone = await this.zoneRepo.findOne({ where: { id } });
    if (!zone) throw new NotFoundException(`Zone ${id} not found`);
    await this.zoneRepo.remove(zone);
  }

  async togglePump(zoneId: string, action: 'PUMP_ON' | 'PUMP_OFF') {
    const zone = await this.zoneRepo.findOne({
      where: { id: zoneId },
      relations: ['devices'],
    });
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found`);

    const results = await Promise.allSettled(
      zone.devices.map((device) =>
        this.syncService.sendCommandToDevice(device.id, action, {
          irrigationMode: zone.irrigationMode,
          source: 'zone',
          zoneId,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    zone.pumpEnabled = action === 'PUMP_ON';
    await this.zoneRepo.save(zone);

    return { zoneId, action, succeeded, failed, total: zone.devices.length };
  }
}
