import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository } from 'typeorm';

import { DeviceSchedule, ScheduleType } from './entities/device-schedule.entity';
import { CreateDeviceScheduleDto } from './dto/create-device-schedule.dto';
import { UpdateDeviceScheduleDto } from './dto/update-device-schedule.dto';
import { SyncService } from 'src/device/sync/sync.service';
import { DeviceService } from 'src/device/device.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private executing = false;

  constructor(
    @InjectRepository(DeviceSchedule)
    private readonly scheduleRepository: Repository<DeviceSchedule>,
    private readonly syncService: SyncService,
    private readonly deviceService: DeviceService,
  ) {}

  async findAll(deviceId?: string, farmId?: string) {
    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (farmId) where.farmId = farmId;

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
    this.validateTarget(dto.deviceId, dto.farmId);
    this.validateScheduleFields(dto.type, dto);

    const schedule = this.scheduleRepository.create(dto);
    return this.scheduleRepository.save(schedule);
  }

  async update(id: string, dto: UpdateDeviceScheduleDto) {
    const existing = await this.findOne(id);

    if (dto.deviceId !== undefined || dto.farmId !== undefined) {
      this.validateTarget(
        dto.deviceId ?? existing.deviceId,
        dto.farmId ?? existing.farmId,
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

  private validateTarget(deviceId?: string, farmId?: string) {
    const hasDevice = !!deviceId;
    const hasFarm = !!farmId;
    if (hasDevice === hasFarm) {
      throw new BadRequestException(
        'Exactly one of deviceId or farmId must be provided',
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
        throw new BadRequestException(
          'One-time schedules require executeAt',
        );
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
  }
}
