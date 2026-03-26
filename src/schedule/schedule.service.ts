import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository } from 'typeorm';

import {
  DeviceSchedule,
  ScheduleType,
} from './entities/device-schedule.entity';
import { CreateDeviceScheduleDto } from './dto/create-device-schedule.dto';
import { UpdateDeviceScheduleDto } from './dto/update-device-schedule.dto';
import { SyncService } from 'src/device/sync/sync.service';
import { DeviceService } from 'src/device/device.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';
import { FcmService } from 'src/notification/fcm.service';
import { Farm } from 'src/farm/entities/farm.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { Device } from 'src/device/entities/device.entity';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ConfigResolutionService } from 'src/zone/config-resolution.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private executing = false;

  // Commands that change irrigation mode and require threshold profile re-sync
  private static readonly MODE_CHANGE_COMMANDS = new Set([
    'SET_IRRIGATION_MODE',
    'SET_MODE',
  ]);

  // farmId → farm owner userId cache (5min TTL)
  private farmOwnerCache: Map<string, { userId: string; loadedAt: number }> =
    new Map();
  private readonly FARM_OWNER_CACHE_TTL = 300_000;

  constructor(
    @InjectRepository(DeviceSchedule)
    private readonly scheduleRepository: Repository<DeviceSchedule>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(Zone)
    private readonly zoneRepo: Repository<Zone>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    private readonly syncService: SyncService,
    private readonly deviceService: DeviceService,
    private readonly deviceGateway: DeviceGateway,
    private readonly fcmService: FcmService,
    private readonly configResolution: ConfigResolutionService,
  ) {}

  private async getFarmOwnerId(farmId: string): Promise<string | null> {
    const cached = this.farmOwnerCache.get(farmId);
    if (cached && Date.now() - cached.loadedAt < this.FARM_OWNER_CACHE_TTL) {
      return cached.userId;
    }
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) return null;
    this.farmOwnerCache.set(farmId, {
      userId: farm.userId,
      loadedAt: Date.now(),
    });
    return farm.userId;
  }

  async findAll(deviceId?: string, farmId?: string, zoneId?: string) {
    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (farmId) where.farmId = farmId;
    if (zoneId) where.zoneId = zoneId;

    return this.scheduleRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const schedule = await this.scheduleRepository.findOne(id);
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    return schedule;
  }

  async create(dto: CreateDeviceScheduleDto) {
    this.validateTarget(dto.deviceId, dto.farmId, dto.zoneId);
    this.validateScheduleFields(dto.type, dto);

    const schedule = this.scheduleRepository.create(dto);
    return this.scheduleRepository.save(schedule);
  }

  async update(id: string, dto: UpdateDeviceScheduleDto) {
    const existing = await this.findOne(id);

    if (dto.deviceId !== undefined || dto.farmId !== undefined || dto.zoneId !== undefined) {
      this.validateTarget(
        dto.deviceId ?? existing.deviceId,
        dto.farmId ?? existing.farmId,
        dto.zoneId ?? existing.zoneId,
      );
    }

    const type = dto.type ?? existing.type;
    this.validateScheduleFields(type, { ...existing, ...dto });

    const schedule = await this.scheduleRepository.preload({ id, ...dto });
    return this.scheduleRepository.save(schedule);
  }

  async remove(id: string) {
    const schedule = await this.findOne(id);
    return this.scheduleRepository.remove(schedule);
  }

  async toggle(id: string) {
    const schedule = await this.findOne(id);
    schedule.enabled = !schedule.enabled;
    return this.scheduleRepository.save(schedule);
  }

  private validateTarget(deviceId?: string, farmId?: string, zoneId?: string) {
    const count = [deviceId, farmId, zoneId].filter(Boolean).length;
    if (count !== 1) {
      throw new BadRequestException(
        'Exactly one of deviceId, farmId, or zoneId must be provided',
      );
    }
  }

  private validateScheduleFields(type: ScheduleType, fields: any) {
    if (type === ScheduleType.RECURRING) {
      if (!fields.daysOfWeek?.length || !fields.time) {
        throw new BadRequestException(
          'Recurring schedules require daysOfWeek and time',
        );
      }
    } else if (type === ScheduleType.ONE_TIME) {
      if (!fields.executeAt) {
        throw new BadRequestException('One-time schedules require executeAt');
      }
    }
  }

  // --- Execution engine ---

  @Interval(60_000)
  async processSchedules() {
    if (this.executing) return;
    this.executing = true;

    try {
      const schedules = await this.scheduleRepository.find({
        where: { enabled: true },
      });

      const now = new Date();

      for (const schedule of schedules) {
        if (this.shouldExecute(schedule, now)) {
          await this.execute(schedule, now);
        }
      }
    } catch (error) {
      this.logger.error('Error processing schedules', error.stack);
    } finally {
      this.executing = false;
    }
  }

  private shouldExecute(schedule: DeviceSchedule, now: Date): boolean {
    if (schedule.type === ScheduleType.ONE_TIME) {
      return (
        schedule.executeAt &&
        schedule.executeAt <= now &&
        !schedule.lastExecutedAt
      );
    }

    // Recurring
    const { dayOfWeek, hours, minutes } = this.getLocalTime(
      now,
      schedule.timezone,
    );

    if (!schedule.daysOfWeek.includes(dayOfWeek)) return false;

    const [schedHour, schedMinute] = schedule.time.split(':').map(Number);
    if (hours !== schedHour || minutes !== schedMinute) return false;

    // Prevent duplicate execution within the same minute
    if (schedule.lastExecutedAt) {
      const lastLocal = this.getLocalTime(
        schedule.lastExecutedAt,
        schedule.timezone,
      );
      if (
        lastLocal.year === this.getLocalTime(now, schedule.timezone).year &&
        lastLocal.month === this.getLocalTime(now, schedule.timezone).month &&
        lastLocal.day === this.getLocalTime(now, schedule.timezone).day &&
        lastLocal.hours === schedHour &&
        lastLocal.minutes === schedMinute
      ) {
        return false;
      }
    }

    return true;
  }

  private getLocalTime(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    return {
      year: parseInt(parts.year),
      month: parseInt(parts.month),
      day: parseInt(parts.day),
      dayOfWeek: dayMap[parts.weekday] as number,
      hours: parseInt(parts.hour === '24' ? '0' : parts.hour),
      minutes: parseInt(parts.minute),
    };
  }

  private async execute(schedule: DeviceSchedule, now: Date) {
    this.logger.log(`Executing schedule "${schedule.name}" (${schedule.id})`);

    try {
      if (schedule.deviceId) {
        await this.syncService.sendCommandToDevice(
          schedule.deviceId,
          schedule.command,
          schedule.params,
        );
      } else if (schedule.zoneId) {
        const zone = await this.zoneRepo.findOne({
          where: { id: schedule.zoneId },
          relations: ['devices'],
        });
        if (zone) {
          for (const device of zone.devices) {
            try {
              await this.syncService.sendCommandToDevice(
                device.id,
                schedule.command,
                schedule.params,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to send command to device ${device.id} for zone schedule ${schedule.id}: ${err.message}`,
              );
            }
          }
        }
      } else if (schedule.farmId) {
        const devices = await this.deviceService.findAll(schedule.farmId);
        for (const device of devices) {
          try {
            await this.syncService.sendCommandToDevice(
              device.id,
              schedule.command,
              schedule.params,
            );
          } catch (err) {
            this.logger.warn(
              `Failed to send command to device ${device.id} for schedule ${schedule.id}: ${err.message}`,
            );
          }
        }
      }

      // Sync irrigationMode in DB so threshold evaluation uses the new profile
      await this.applyModeChange(schedule);
    } catch (error) {
      this.logger.error(
        `Failed to execute schedule ${schedule.id}: ${error.message}`,
      );
      return;
    }

    schedule.lastExecutedAt = now;
    if (schedule.type === ScheduleType.ONE_TIME) {
      schedule.enabled = false;
    }
    await this.scheduleRepository.save(schedule);

    // Push notification for schedule execution — resolve farmId from zone if needed
    const farmId =
      schedule.farmId ||
      (schedule.zoneId
        ? (await this.zoneRepo.findOne({ where: { id: schedule.zoneId } }))?.farmId
        : null) ||
      (schedule.deviceId
        ? (await this.deviceService.findOne(schedule.deviceId))?.farmId
        : null);

    if (farmId) {
      const farmOwnerId = await this.getFarmOwnerId(farmId);
      const isOnline =
        farmOwnerId && this.deviceGateway.isUserConnected(farmOwnerId);

      if (!isOnline) {
        this.fcmService
          .sendToFarmOwner(farmId, {
            title: `Schedule: ${schedule.name}`,
            body: `Command "${schedule.command}" executed`,
            data: {
              type: 'SCHEDULE_EXECUTED',
              scheduleId: schedule.id,
              command: schedule.command,
            },
          })
          .catch((err) =>
            this.logger.error('FCM schedule notification failed:', err.message),
          );
      } else {
        this.logger.debug(
          `Skipping FCM for schedule ${schedule.id} — user ${farmOwnerId} is online`,
        );
      }
    }
  }

  /**
   * When a schedule sends a mode-change command, update irrigationMode in DB
   * so that subsequent telemetry evaluation uses the correct threshold profile.
   */
  private async applyModeChange(schedule: DeviceSchedule): Promise<void> {
    if (!ScheduleService.MODE_CHANGE_COMMANDS.has(schedule.command)) return;

    // Support both param key conventions: { mode } or { irrigationMode }
    const modeValue = schedule.params?.mode ?? schedule.params?.irrigationMode;
    if (!modeValue || !Object.values(IrrigationMode).includes(modeValue)) return;

    const irrigationMode = modeValue as IrrigationMode;

    if (schedule.zoneId) {
      await this.zoneRepo.update(schedule.zoneId, { irrigationMode });
      this.configResolution.invalidateCacheByZone(schedule.zoneId);
      this.logger.log(
        `Applied irrigationMode="${irrigationMode}" to zone ${schedule.zoneId}`,
      );
    } else if (schedule.deviceId) {
      await this.deviceRepo.update(schedule.deviceId, { irrigationMode });
      this.configResolution.invalidateCache(schedule.deviceId);
      this.logger.log(
        `Applied irrigationMode="${irrigationMode}" to device ${schedule.deviceId}`,
      );
    } else if (schedule.farmId) {
      await this.deviceRepo.update({ farmId: schedule.farmId }, { irrigationMode });
      const devices = await this.deviceService.findAll(schedule.farmId);
      for (const device of devices) {
        this.configResolution.invalidateCache(device.id);
      }
      this.logger.log(
        `Applied irrigationMode="${irrigationMode}" to all devices in farm ${schedule.farmId}`,
      );
    }
  }
}
