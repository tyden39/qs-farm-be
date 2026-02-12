import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';

import { Device } from 'src/device/entities/device.entity';
import { SensorConfig } from './entities/sensor-config.entity';
import { SensorThreshold } from './entities/sensor-threshold.entity';
import { SensorData } from './entities/sensor-data.entity';
import { AlertLog } from './entities/alert-log.entity';
import { CommandLog, CommandSource } from './entities/command-log.entity';
import { PAYLOAD_TO_SENSOR_TYPE } from './enums/sensor-type.enum';
import { SensorMode } from './enums/sensor-mode.enum';
import { CreateSensorConfigDto } from './dto/create-sensor-config.dto';
import { UpdateSensorConfigDto } from './dto/update-sensor-config.dto';
import { CreateSensorThresholdDto } from './dto/create-sensor-threshold.dto';
import { UpdateSensorThresholdDto } from './dto/update-sensor-threshold.dto';
import { QuerySensorDataDto } from './dto/query-sensor-data.dto';
import { QueryAlertLogDto } from './dto/query-alert-log.dto';
import { QuerySensorStatsDto } from './dto/query-sensor-stats.dto';
import { QueryAlertSummaryDto } from './dto/query-alert-summary.dto';
import { QueryCommandLogDto } from './dto/query-command-log.dto';
import { QueryFarmComparisonDto } from './dto/query-farm-comparison.dto';
import { ThresholdService } from './threshold.service';

interface TelemetryEvent {
  deviceId: string;
  payload: any;
  timestamp: Date;
}

interface CommandDispatchedEvent {
  deviceId: string;
  command: string;
  params: any;
  success: boolean;
  errorMessage?: string;
}

@Injectable()
export class SensorService {
  private readonly logger = new Logger(SensorService.name);

  private configCache: Map<
    string,
    { configs: SensorConfig[]; loadedAt: number }
  > = new Map();
  private readonly CACHE_TTL = 60_000;

  constructor(
    @InjectRepository(SensorConfig)
    private readonly sensorConfigRepo: Repository<SensorConfig>,
    @InjectRepository(SensorThreshold)
    private readonly sensorThresholdRepo: Repository<SensorThreshold>,
    @InjectRepository(SensorData)
    private readonly sensorDataRepo: Repository<SensorData>,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    @InjectRepository(CommandLog)
    private readonly commandLogRepo: Repository<CommandLog>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    private readonly thresholdService: ThresholdService,
  ) {}

  // --- Telemetry Processing ---

  @OnEvent('telemetry.received')
  async processTelemetry(event: TelemetryEvent) {
    const { deviceId, payload } = event;

    try {
      // Parse payload into individual sensor readings
      const readings: { sensorType: string; value: number }[] = [];
      for (const [field, sensorType] of Object.entries(PAYLOAD_TO_SENSOR_TYPE)) {
        if (payload[field] !== undefined && payload[field] !== null) {
          readings.push({ sensorType, value: Number(payload[field]) });
        }
      }

      if (readings.length === 0) return;

      // Bulk insert sensor data
      const sensorDataEntities = readings.map((r) =>
        this.sensorDataRepo.create({
          deviceId,
          sensorType: r.sensorType as any,
          value: r.value,
        }),
      );
      await this.sensorDataRepo.save(sensorDataEntities);

      // Load configs (cached)
      const configs = await this.getConfigsForDevice(deviceId);

      // Evaluate thresholds for each reading
      for (const reading of readings) {
        const config = configs.find(
          (c) =>
            c.sensorType === reading.sensorType &&
            c.enabled &&
            c.mode === SensorMode.AUTO,
        );
        if (!config || !config.thresholds?.length) continue;

        await this.thresholdService.evaluate(
          deviceId,
          config,
          reading.value,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing telemetry for device ${deviceId}:`,
        error,
      );
    }
  }

  // --- Config Cache ---

  async getConfigsForDevice(deviceId: string): Promise<SensorConfig[]> {
    const cached = this.configCache.get(deviceId);
    if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL) {
      return cached.configs;
    }
    const configs = await this.sensorConfigRepo.find({
      where: { deviceId },
      relations: ['thresholds'],
    });
    this.configCache.set(deviceId, { configs, loadedAt: Date.now() });
    return configs;
  }

  invalidateCache(deviceId: string) {
    this.configCache.delete(deviceId);
  }

  // --- Sensor Config CRUD ---

  async findAllConfigs(deviceId: string) {
    return this.sensorConfigRepo.find({
      where: { deviceId },
      relations: ['thresholds'],
    });
  }

  async createConfig(deviceId: string, dto: CreateSensorConfigDto) {
    const config = this.sensorConfigRepo.create({ ...dto, deviceId });
    const saved = await this.sensorConfigRepo.save(config);
    this.invalidateCache(deviceId);
    return saved;
  }

  async updateConfig(deviceId: string, id: string, dto: UpdateSensorConfigDto) {
    const config = await this.sensorConfigRepo.findOne({
      where: { id, deviceId },
    });
    if (!config) throw new NotFoundException('Sensor config not found');
    Object.assign(config, dto);
    const saved = await this.sensorConfigRepo.save(config);
    this.invalidateCache(deviceId);
    return saved;
  }

  async removeConfig(deviceId: string, id: string) {
    const config = await this.sensorConfigRepo.findOne({
      where: { id, deviceId },
    });
    if (!config) throw new NotFoundException('Sensor config not found');
    await this.sensorConfigRepo.remove(config);
    this.invalidateCache(deviceId);
  }

  // --- Sensor Threshold CRUD ---

  async findAllThresholds(configId: string) {
    return this.sensorThresholdRepo.find({
      where: { sensorConfigId: configId },
    });
  }

  async createThreshold(configId: string, dto: CreateSensorThresholdDto) {
    const config = await this.sensorConfigRepo.findOne({
      where: { id: configId },
    });
    if (!config) throw new NotFoundException('Sensor config not found');

    const threshold = this.sensorThresholdRepo.create({
      ...dto,
      sensorConfigId: configId,
    });
    const saved = await this.sensorThresholdRepo.save(threshold);
    this.invalidateCache(config.deviceId);
    return saved;
  }

  async updateThreshold(
    configId: string,
    id: string,
    dto: UpdateSensorThresholdDto,
  ) {
    const threshold = await this.sensorThresholdRepo.findOne({
      where: { id, sensorConfigId: configId },
    });
    if (!threshold) throw new NotFoundException('Sensor threshold not found');

    const config = await this.sensorConfigRepo.findOne({
      where: { id: configId },
    });

    Object.assign(threshold, dto);
    const saved = await this.sensorThresholdRepo.save(threshold);
    if (config) this.invalidateCache(config.deviceId);
    return saved;
  }

  async removeThreshold(configId: string, id: string) {
    const threshold = await this.sensorThresholdRepo.findOne({
      where: { id, sensorConfigId: configId },
    });
    if (!threshold) throw new NotFoundException('Sensor threshold not found');

    const config = await this.sensorConfigRepo.findOne({
      where: { id: configId },
    });

    await this.sensorThresholdRepo.remove(threshold);
    if (config) this.invalidateCache(config.deviceId);
  }

  // --- Sensor Data Queries ---

  async findSensorData(deviceId: string, query: QuerySensorDataDto) {
    const qb = this.sensorDataRepo
      .createQueryBuilder('sd')
      .where('sd.deviceId = :deviceId', { deviceId })
      .orderBy('sd.createdAt', 'DESC');

    if (query.sensorType) {
      qb.andWhere('sd.sensorType = :sensorType', {
        sensorType: query.sensorType,
      });
    }
    if (query.from) {
      qb.andWhere('sd.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('sd.createdAt <= :to', { to: query.to });
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    qb.take(limit);

    return qb.getMany();
  }

  async findLatestSensorData(deviceId: string) {
    const results = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .distinctOn(['sd.sensorType'])
      .where('sd.deviceId = :deviceId', { deviceId })
      .orderBy('sd.sensorType')
      .addOrderBy('sd.createdAt', 'DESC')
      .getMany();

    return results;
  }

  // --- Alert Log Queries ---

  async findAlerts(deviceId: string, query: QueryAlertLogDto) {
    const qb = this.alertLogRepo
      .createQueryBuilder('al')
      .where('al.deviceId = :deviceId', { deviceId })
      .orderBy('al.createdAt', 'DESC');

    if (query.sensorType) {
      qb.andWhere('al.sensorType = :sensorType', {
        sensorType: query.sensorType,
      });
    }
    if (query.level) {
      qb.andWhere('al.level = :level', { level: query.level });
    }
    if (query.from) {
      qb.andWhere('al.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('al.createdAt <= :to', { to: query.to });
    }
    if (query.acknowledged !== undefined) {
      qb.andWhere('al.acknowledged = :acknowledged', {
        acknowledged: query.acknowledged === 'true',
      });
    }

    return qb.getMany();
  }

  async acknowledgeAlert(deviceId: string, id: string) {
    const alert = await this.alertLogRepo.findOne({
      where: { id, deviceId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    alert.acknowledged = true;
    return this.alertLogRepo.save(alert);
  }

  // --- Command Log (manual commands via event) ---

  @OnEvent('command.dispatched')
  async handleCommandDispatched(event: CommandDispatchedEvent) {
    try {
      await this.commandLogRepo.save(
        this.commandLogRepo.create({
          deviceId: event.deviceId,
          command: event.command,
          params: event.params,
          source: CommandSource.MANUAL,
          success: event.success,
          errorMessage: event.errorMessage,
        }),
      );
    } catch (error) {
      this.logger.error('Failed to log manual command:', error);
    }
  }

  // --- Stats & Reports ---

  async getDeviceStats(deviceId: string, query: QuerySensorStatsDto) {
    const qb = this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType = :sensorType', {
        sensorType: query.sensorType,
      });

    if (query.from) {
      qb.andWhere('sd.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('sd.createdAt <= :to', { to: query.to });
    }

    return qb.getRawOne();
  }

  async getDeviceTimeseries(deviceId: string, query: QuerySensorStatsDto) {
    const bucket = query.bucket || 'hour';

    const qb = this.sensorDataRepo
      .createQueryBuilder('sd')
      .select(`DATE_TRUNC(:bucket, sd.createdAt)`, 'bucket')
      .addSelect('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType = :sensorType', {
        sensorType: query.sensorType,
      })
      .setParameter('bucket', bucket)
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');

    if (query.from) {
      qb.andWhere('sd.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('sd.createdAt <= :to', { to: query.to });
    }

    return qb.getRawMany();
  }

  async getAlertSummary(deviceId: string, query: QueryAlertSummaryDto) {
    const qb = this.alertLogRepo
      .createQueryBuilder('al')
      .select('al.level', 'level')
      .addSelect('al.sensorType', 'sensorType')
      .addSelect('al.acknowledged', 'acknowledged')
      .addSelect('COUNT(*)', 'count')
      .where('al.deviceId = :deviceId', { deviceId })
      .groupBy('al.level')
      .addGroupBy('al.sensorType')
      .addGroupBy('al.acknowledged');

    if (query.from) {
      qb.andWhere('al.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('al.createdAt <= :to', { to: query.to });
    }

    return qb.getRawMany();
  }

  async getCommandLog(deviceId: string, query: QueryCommandLogDto) {
    const qb = this.commandLogRepo
      .createQueryBuilder('cl')
      .where('cl.deviceId = :deviceId', { deviceId })
      .orderBy('cl.createdAt', 'DESC');

    if (query.source) {
      qb.andWhere('cl.source = :source', { source: query.source });
    }
    if (query.from) {
      qb.andWhere('cl.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('cl.createdAt <= :to', { to: query.to });
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    qb.take(limit);

    return qb.getMany();
  }

  // --- Farm-Level Reports ---

  async getFarmDashboard(farmId: string) {
    const devices = await this.deviceRepo.find({ where: { farmId } });

    const result = await Promise.all(
      devices.map(async (device) => {
        const latestReadings = await this.findLatestSensorData(device.id);
        return {
          deviceId: device.id,
          name: device.name,
          status: device.status,
          latestReadings,
        };
      }),
    );

    return result;
  }

  async getFarmAlertOverview(farmId: string, query: QueryAlertSummaryDto) {
    const qb = this.alertLogRepo
      .createQueryBuilder('al')
      .innerJoin(Device, 'd', 'd.id = al.deviceId')
      .select('al.deviceId', 'deviceId')
      .addSelect('d.name', 'deviceName')
      .addSelect('al.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .where('d.farmId = :farmId', { farmId })
      .groupBy('al.deviceId')
      .addGroupBy('d.name')
      .addGroupBy('al.level');

    if (query.from) {
      qb.andWhere('al.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('al.createdAt <= :to', { to: query.to });
    }

    return qb.getRawMany();
  }

  async getFarmComparison(farmId: string, query: QueryFarmComparisonDto) {
    const qb = this.sensorDataRepo
      .createQueryBuilder('sd')
      .innerJoin(Device, 'd', 'd.id = sd.deviceId')
      .select('sd.deviceId', 'deviceId')
      .addSelect('d.name', 'deviceName')
      .addSelect('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('d.farmId = :farmId', { farmId })
      .andWhere('sd.sensorType = :sensorType', {
        sensorType: query.sensorType,
      })
      .groupBy('sd.deviceId')
      .addGroupBy('d.name');

    if (query.from) {
      qb.andWhere('sd.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('sd.createdAt <= :to', { to: query.to });
    }

    return qb.getRawMany();
  }

  // --- System-Level Reports ---

  async getSystemOverview() {
    const [devicesByStatus, alertsByLevel, activeDeviceCount] =
      await Promise.all([
        this.deviceRepo
          .createQueryBuilder('d')
          .select('d.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('d.status')
          .getRawMany(),
        this.alertLogRepo
          .createQueryBuilder('al')
          .select('al.level', 'level')
          .addSelect('COUNT(*)', 'count')
          .groupBy('al.level')
          .getRawMany(),
        this.sensorDataRepo
          .createQueryBuilder('sd')
          .select('COUNT(DISTINCT sd.deviceId)', 'count')
          .where("sd.createdAt >= NOW() - INTERVAL '24 hours'")
          .getRawOne(),
      ]);

    return {
      devicesByStatus,
      alertsByLevel,
      activeDevicesLast24h: activeDeviceCount?.count || '0',
    };
  }
}
