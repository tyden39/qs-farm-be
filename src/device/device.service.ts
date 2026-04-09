import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';

import { Connection, Repository } from 'typeorm';

import { Device, DeviceStatus } from './entities/device.entity';
import { PairingToken } from './entities/pairing-token.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { CommandLog } from 'src/sensor/entities/command-log.entity';
import { SensorConfig } from 'src/sensor/entities/sensor-config.entity';
import { DeviceSchedule } from 'src/schedule/entities/device-schedule.entity';
import { MqttService } from './mqtt/mqtt.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(SensorData)
    private readonly sensorDataRepository: Repository<SensorData>,
    @InjectRepository(AlertLog)
    private readonly alertLogRepository: Repository<AlertLog>,
    @InjectRepository(CommandLog)
    private readonly commandLogRepository: Repository<CommandLog>,
    @InjectRepository(SensorConfig)
    private readonly sensorConfigRepository: Repository<SensorConfig>,
    @InjectRepository(DeviceSchedule)
    private readonly deviceScheduleRepository: Repository<DeviceSchedule>,
    @InjectRepository(PairingToken)
    private readonly pairingTokenRepository: Repository<PairingToken>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly mqttService: MqttService,
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

    // Sync farmId when zoneId changes
    if (updateDeviceDto.zoneId) {
      const zone = await this.zoneRepository.findOne({
        where: { id: updateDeviceDto.zoneId },
      });
      if (zone) device.farmId = zone.farmId;
    }

    return this.deviceRepository.save(device);
  }

  async remove(id: string) {
    const device = await this.findOne(id);
    // Best-effort: send factory_reset before deleting; ignore if device is offline
    try {
      await this.mqttService.publishToDevice(device.id, 'factory_reset', {}, device.gatewayId, device.serial);
      this.logger.log(`factory_reset sent to device ${device.id}`);
    } catch (err: any) {
      this.logger.warn(`factory_reset not delivered to device ${device.id}: ${err.message}`);
    }
    await this.cleanDeviceData(device.id, device.serial);
    return this.deviceRepository.remove(device);
  }

  async resetDevice(id: string) {
    const device = await this.findOne(id);
    await this.cleanDeviceData(device.id, device.serial);
    await this.deviceRepository.update(id, {
      farmId: null,
      deviceToken: null,
      status: DeviceStatus.PENDING,
      pairedAt: null,
    });
    return this.deviceRepository.findOne({ where: { id } });
  }

  // Transactionally delete all data associated with a device.
  // Used by both remove() and resetDevice() so re-pairing behaves like a fresh setup.
  private async cleanDeviceData(
    deviceId: string,
    serial: string | null,
  ): Promise<void> {
    await this.connection.transaction(async (manager) => {
      await manager.delete(AlertLog, { deviceId });
      await manager.delete(CommandLog, { deviceId });
      await manager.delete(SensorData, { deviceId });
      await manager.delete(DeviceSchedule, { deviceId });
      // SensorThreshold is deleted automatically via DB-level onDelete: CASCADE on FK
      await manager.delete(SensorConfig, { deviceId });
      if (serial) {
        await manager.delete(PairingToken, { serial });
      }
    });
  }
}
