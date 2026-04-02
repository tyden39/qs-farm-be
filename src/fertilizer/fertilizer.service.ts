import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import { FertilizerSession } from './entities/fertilizer-session.entity';
import { FertilizerSessionStatus } from './enums/fertilizer-session-status.enum';
import { FertilizerInterruptedReason } from './enums/fertilizer-interrupted-reason.enum';
import { FertilizerControlMode } from './enums/fertilizer-control-mode.enum';
import { FertilizerReportQueryDto } from './dto/fertilizer-report-query.dto';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';
import { TimeBucket } from 'src/sensor/enums/time-bucket.enum';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';

// Fertilizer event interfaces
export interface FertilizerStartedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
  controlMode?: string;
}

export interface FertilizerStoppedEvent {
  deviceId: string;
  farmId?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface FertilizerDisconnectedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
}

// Fertilizer-specific sensor types for aggregation
const FERT_SENSOR_TYPES = [
  SensorType.FERT_TEMPERATURE,
  SensorType.FERT_CURRENT,
  SensorType.FERT_PHASE,
];

@Injectable()
export class FertilizerService {
  private readonly logger = new Logger(FertilizerService.name);
  private executing = false;

  constructor(
    @InjectRepository(FertilizerSession)
    private readonly fertSessionRepo: Repository<FertilizerSession>,
    @InjectRepository(SensorData)
    private readonly sensorDataRepo: Repository<SensorData>,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // --- Session Lifecycle ---

  @OnEvent('fertilizer.started')
  async handleFertilizerStarted(event: FertilizerStartedEvent) {
    const { deviceId, timestamp } = event;

    try {
      // Check for existing active session (server restart case)
      const existing = await this.fertSessionRepo.findOne({
        where: { deviceId, status: FertilizerSessionStatus.ACTIVE },
      });

      if (existing) {
        this.logger.log(
          `Reusing active fertilizer session ${existing.id} for device ${deviceId}`,
        );
        await this.publishSessionId(deviceId, existing.id);
        return;
      }

      // Get next session number
      const maxResult = await this.fertSessionRepo
        .createQueryBuilder('fs')
        .select('MAX(fs.sessionNumber)', 'max')
        .where('fs.deviceId = :deviceId', { deviceId })
        .getRawOne();

      const sessionNumber = (maxResult?.max || 0) + 1;

      // Validate control mode (fallback to MANUAL if invalid/missing)
      const validControlModes = Object.values(FertilizerControlMode);
      const controlMode = validControlModes.includes(
        event.controlMode as FertilizerControlMode,
      )
        ? (event.controlMode as FertilizerControlMode)
        : FertilizerControlMode.MANUAL;

      const session = this.fertSessionRepo.create({
        deviceId,
        sessionNumber,
        startedAt: timestamp,
        controlMode,
        status: FertilizerSessionStatus.ACTIVE,
      });

      const saved = await this.fertSessionRepo.save(session);

      this.logger.log(
        `Fertilizer session #${sessionNumber} started for device ${deviceId} (id=${saved.id})`,
      );

      await this.publishSessionId(deviceId, saved.id);

      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'fertilizer_session_started',
          sessionId: saved.id,
          sessionNumber,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling fertilizer.started for device ${deviceId}:`,
        error,
      );
    }
  }

  @OnEvent('fertilizer.stopped')
  async handleFertilizerStopped(event: FertilizerStoppedEvent) {
    const { deviceId, sessionId, timestamp } = event;

    try {
      let session: FertilizerSession;

      if (sessionId) {
        session = await this.fertSessionRepo.findOne({
          where: { id: sessionId, status: FertilizerSessionStatus.ACTIVE },
        });

        if (!session) {
          this.logger.warn(
            `No active fertilizer session found with id=${sessionId} for device ${deviceId}`,
          );
          return;
        }

        await this.closeSession(
          session,
          timestamp,
          FertilizerSessionStatus.COMPLETED,
        );
      } else {
        session = await this.fertSessionRepo.findOne({
          where: { deviceId, status: FertilizerSessionStatus.ACTIVE },
        });

        if (!session) {
          this.logger.debug(
            `No active fertilizer session for device ${deviceId} on fertilizer.stopped`,
          );
          return;
        }

        await this.closeSession(
          session,
          timestamp,
          FertilizerSessionStatus.INTERRUPTED,
          FertilizerInterruptedReason.ESP_REBOOT,
        );
      }

      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'fertilizer_session_ended',
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          status: session.status,
          durationSeconds: session.durationSeconds,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling fertilizer.stopped for device ${deviceId}:`,
        error,
      );
    }
  }

  @OnEvent('fertilizer.disconnected')
  async handleFertilizerDisconnected(event: FertilizerDisconnectedEvent) {
    const { deviceId } = event;

    try {
      const session = await this.fertSessionRepo.findOne({
        where: { deviceId, status: FertilizerSessionStatus.ACTIVE },
      });

      if (!session) {
        this.logger.debug(
          `No active fertilizer session for device ${deviceId} on LWT disconnect`,
        );
        return;
      }

      // endedAt = last fertilizer sensor data timestamp (avoids using pump data)
      const lastData = await this.getLastFertSensorTimestamp(deviceId);
      const endedAt =
        lastData && lastData > session.startedAt ? lastData : event.timestamp;

      await this.closeSession(
        session,
        endedAt,
        FertilizerSessionStatus.INTERRUPTED,
        FertilizerInterruptedReason.LWT,
      );

      this.logger.log(
        `Fertilizer session ${session.id} closed as LWT for device ${deviceId}`,
      );

      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'fertilizer_session_ended',
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          status: FertilizerSessionStatus.INTERRUPTED,
          reason: FertilizerInterruptedReason.LWT,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling fertilizer.disconnected for device ${deviceId}:`,
        error,
      );
    }
  }

  private async publishSessionId(deviceId: string, sessionId: string) {
    try {
      await this.mqttService.publishToTopic(`device/${deviceId}/fert-session`, {
        sessionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish fertilizer sessionId to device ${deviceId}:`,
        error,
      );
    }
  }

  private async closeSession(
    session: FertilizerSession,
    endedAt: Date,
    status: FertilizerSessionStatus,
    reason?: FertilizerInterruptedReason,
  ) {
    session.endedAt = endedAt;
    session.status = status;
    session.interruptedReason = reason || null;
    session.durationSeconds = Math.max(
      0,
      (endedAt.getTime() - session.startedAt.getTime()) / 1000,
    );

    await this.computeSessionAggregates(session);
    await this.computeOvercurrentData(session);
    await this.fertSessionRepo.save(session);
  }

  private async computeSessionAggregates(session: FertilizerSession) {
    const { deviceId, startedAt, endedAt } = session;

    const tempStats = await this.getSensorAggregates(
      deviceId,
      SensorType.FERT_TEMPERATURE,
      startedAt,
      endedAt,
    );
    if (tempStats) {
      session.tempMin = tempStats.min;
      session.tempMax = tempStats.max;
      session.tempAvg = tempStats.avg;
    }

    const currentStats = await this.getSensorAggregates(
      deviceId,
      SensorType.FERT_CURRENT,
      startedAt,
      endedAt,
    );
    if (currentStats) {
      session.currentMin = currentStats.min;
      session.currentMax = currentStats.max;
      session.currentAvg = currentStats.avg;
    }

    // Phase count (distinct values)
    const phaseResult = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('COUNT(DISTINCT sd.value)', 'count')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType = :sensorType', {
        sensorType: SensorType.FERT_PHASE,
      })
      .andWhere('sd.createdAt >= :from', { from: startedAt })
      .andWhere('sd.createdAt <= :to', { to: endedAt })
      .getRawOne();

    session.phaseCount = parseInt(phaseResult?.count || '0', 10);
  }

  private async getSensorAggregates(
    deviceId: string,
    sensorType: SensorType,
    from: Date,
    to: Date,
  ): Promise<{ min: number; max: number; avg: number } | null> {
    const result = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType = :sensorType', { sensorType })
      .andWhere('sd.createdAt >= :from', { from })
      .andWhere('sd.createdAt <= :to', { to })
      .getRawOne();

    if (!result || result.min === null) return null;

    return {
      min: parseFloat(result.min),
      max: parseFloat(result.max),
      avg: parseFloat(result.avg),
    };
  }

  private async computeOvercurrentData(session: FertilizerSession) {
    const { deviceId, startedAt, endedAt } = session;

    const overcurrentAlerts = await this.alertLogRepo
      .createQueryBuilder('al')
      .where('al.deviceId = :deviceId', { deviceId })
      .andWhere('al.sensorType = :sensorType', {
        sensorType: SensorType.FERT_CURRENT,
      })
      .andWhere('al.level = :level', { level: ThresholdLevel.CRITICAL })
      .andWhere('al.createdAt >= :from', { from: startedAt })
      .andWhere('al.createdAt <= :to', { to: endedAt })
      .getMany();

    if (overcurrentAlerts.length > 0) {
      session.overcurrentDetected = true;
      session.overcurrentCount = overcurrentAlerts.length;
      session.overcurrentMaxCurrent = Math.max(
        ...overcurrentAlerts.map((a) => a.value),
      );
      session.hasAlert = true;
    }

    if (!session.hasAlert) {
      const anyAlert = await this.alertLogRepo
        .createQueryBuilder('al')
        .where('al.deviceId = :deviceId', { deviceId })
        .andWhere('al.sensorType IN (:...sensorTypes)', {
          sensorTypes: FERT_SENSOR_TYPES,
        })
        .andWhere('al.createdAt >= :from', { from: startedAt })
        .andWhere('al.createdAt <= :to', { to: endedAt })
        .getCount();

      session.hasAlert = anyAlert > 0;
    }
  }

  // Use only fertilizer sensor types to avoid pump data interference
  private async getLastFertSensorTimestamp(
    deviceId: string,
  ): Promise<Date | null> {
    const result = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('MAX(sd.createdAt)', 'lastAt')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType IN (:...sensorTypes)', {
        sensorTypes: FERT_SENSOR_TYPES,
      })
      .getRawOne();

    return result?.lastAt ? new Date(result.lastAt) : null;
  }

  // --- Stale Session Cron ---

  @Interval(60_000)
  async cleanupStaleFertilizerSessions() {
    if (this.executing) return;
    this.executing = true;

    try {
      const activeSessions = await this.fertSessionRepo.find({
        where: { status: FertilizerSessionStatus.ACTIVE },
      });

      if (activeSessions.length === 0) return;

      const now = Date.now();
      const STALE_THRESHOLD_MS = 30_000;

      for (const session of activeSessions) {
        try {
          const recentData = await this.sensorDataRepo
            .createQueryBuilder('sd')
            .select('MAX(sd.createdAt)', 'lastAt')
            .where('sd.deviceId = :deviceId', { deviceId: session.deviceId })
            .andWhere('sd.sensorType IN (:...sensorTypes)', {
              sensorTypes: FERT_SENSOR_TYPES,
            })
            .getRawOne();

          const lastDataTime = recentData?.lastAt
            ? new Date(recentData.lastAt).getTime()
            : null;

          if (!lastDataTime || now - lastDataTime > STALE_THRESHOLD_MS) {
            const lastDataDate = lastDataTime ? new Date(lastDataTime) : null;
            const endedAt =
              lastDataDate && lastDataDate > session.startedAt
                ? lastDataDate
                : session.startedAt;

            await this.closeSession(
              session,
              endedAt,
              FertilizerSessionStatus.INTERRUPTED,
              FertilizerInterruptedReason.TIMEOUT,
            );

            this.logger.warn(
              `Stale fertilizer session ${session.id} (device ${session.deviceId}) closed as timeout`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error checking stale fertilizer session ${session.id}:`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error in cleanupStaleFertilizerSessions:', error);
    } finally {
      this.executing = false;
    }
  }

  // --- Report API ---

  async getReport(deviceId: string, query: FertilizerReportQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();

    const [summary, timeline, sessions] = await Promise.all([
      this.getSummary(deviceId, from, to),
      this.getTimeline(deviceId, from, to),
      this.getSessions(deviceId, from, to),
    ]);

    return { summary, timeline, sessions };
  }

  private async getSummary(deviceId: string, from: Date, to: Date) {
    const result = await this.fertSessionRepo
      .createQueryBuilder('fs')
      .select('COUNT(*)', 'totalSessions')
      .addSelect('SUM(fs.durationSeconds)', 'totalDurationSeconds')
      .addSelect('AVG(fs.durationSeconds)', 'avgDurationSeconds')
      .addSelect('MIN(fs.tempMin)', 'tempMin')
      .addSelect('MAX(fs.tempMax)', 'tempMax')
      .addSelect('MIN(fs.currentMin)', 'currentMin')
      .addSelect('MAX(fs.currentMax)', 'currentMax')
      .addSelect(
        'SUM(CASE WHEN fs.overcurrentDetected = true THEN 1 ELSE 0 END)',
        'overcurrentSessions',
      )
      .addSelect('SUM(fs.overcurrentCount)', 'overcurrentTotalCount')
      .where('fs.deviceId = :deviceId', { deviceId })
      .andWhere('fs.startedAt >= :from', { from })
      .andWhere('fs.startedAt <= :to', { to })
      .getRawOne();

    const totalSeconds = parseFloat(result.totalDurationSeconds) || 0;

    return {
      totalSessions: parseInt(result.totalSessions, 10),
      totalDurationHours: +(totalSeconds / 3600).toFixed(2),
      avgDurationMinutes: +(
        (parseFloat(result.avgDurationSeconds) || 0) / 60
      ).toFixed(1),
      tempRange: {
        min: parseFloat(result.tempMin) ?? null,
        max: parseFloat(result.tempMax) ?? null,
      },
      currentRange: {
        min: parseFloat(result.currentMin) ?? null,
        max: parseFloat(result.currentMax) ?? null,
      },
      overcurrentSessions: parseInt(result.overcurrentSessions, 10) || 0,
      overcurrentTotalCount: parseInt(result.overcurrentTotalCount, 10) || 0,
    };
  }

  private getAutoGranularity(from: Date, to: Date): TimeBucket {
    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 2) return TimeBucket.HOUR;
    if (diffDays <= 60) return TimeBucket.DAY;
    if (diffDays <= 365) return TimeBucket.WEEK;
    return TimeBucket.MONTH;
  }

  private async getTimeline(deviceId: string, from: Date, to: Date) {
    const bucket = this.getAutoGranularity(from, to);

    const rows = await this.fertSessionRepo
      .createQueryBuilder('fs')
      .select(`DATE_TRUNC(:bucket, fs.startedAt)`, 'bucket')
      .addSelect('COUNT(*)', 'sessionCount')
      .addSelect('SUM(fs.durationSeconds)', 'totalDurationSeconds')
      .addSelect('AVG(fs.durationSeconds)', 'avgDurationSeconds')
      .setParameter('bucket', bucket)
      .where('fs.deviceId = :deviceId', { deviceId })
      .andWhere('fs.startedAt >= :from', { from })
      .andWhere('fs.startedAt <= :to', { to })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany();

    return {
      granularity: bucket,
      data: rows.map((r) => ({
        bucket: r.bucket,
        sessionCount: parseInt(r.sessionCount, 10),
        totalDurationMinutes: +(
          (parseFloat(r.totalDurationSeconds) || 0) / 60
        ).toFixed(1),
        avgDurationMinutes: +(
          (parseFloat(r.avgDurationSeconds) || 0) / 60
        ).toFixed(1),
      })),
    };
  }

  private async getSessions(deviceId: string, from: Date, to: Date) {
    return this.fertSessionRepo.find({
      where: {
        deviceId,
        startedAt: MoreThanOrEqual(from),
      },
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  // --- Excel Export ---

  async getReportExcel(
    deviceId: string,
    query: FertilizerReportQueryDto,
  ): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const report = await this.getReport(deviceId, query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QS Farm';
    workbook.created = new Date();

    this.buildSessionsSheet(workbook, report);

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  private buildSessionsSheet(workbook: any, report: any) {
    const sheet = workbook.addWorksheet('Fertilizer Sessions');

    const CONTROL_MODE_LABELS: Record<string, string> = {
      [FertilizerControlMode.MANUAL]: 'Thu cong',
      [FertilizerControlMode.AUTO]: 'Tu dong',
      [FertilizerControlMode.SCHEDULE]: 'Hen gio',
    };

    sheet.columns = [
      { header: 'Session #', key: 'sessionNumber', width: 12 },
      { header: 'Control Mode', key: 'controlMode', width: 14 },
      { header: 'Start', key: 'startedAt', width: 20 },
      { header: 'End', key: 'endedAt', width: 20 },
      { header: 'Duration (min)', key: 'duration', width: 15 },
      { header: 'Temp Min', key: 'tempMin', width: 12 },
      { header: 'Temp Max', key: 'tempMax', width: 12 },
      { header: 'Current Min', key: 'currentMin', width: 13 },
      { header: 'Current Max', key: 'currentMax', width: 13 },
      { header: 'Phase Count', key: 'phaseCount', width: 13 },
      { header: 'Overcurrent', key: 'overcurrent', width: 13 },
      { header: 'Alert', key: 'hasAlert', width: 8 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }, // Green theme for fertilizer
    };

    for (const session of report.sessions) {
      sheet.addRow({
        sessionNumber: session.sessionNumber,
        controlMode:
          CONTROL_MODE_LABELS[session.controlMode] || session.controlMode || '',
        startedAt: session.startedAt
          ? new Date(session.startedAt).toLocaleString('vi-VN')
          : '',
        endedAt: session.endedAt
          ? new Date(session.endedAt).toLocaleString('vi-VN')
          : '',
        duration: session.durationSeconds
          ? +(session.durationSeconds / 60).toFixed(1)
          : '',
        tempMin: session.tempMin ?? '',
        tempMax: session.tempMax ?? '',
        currentMin: session.currentMin ?? '',
        currentMax: session.currentMax ?? '',
        phaseCount: session.phaseCount ?? '',
        overcurrent: session.overcurrentDetected
          ? `Yes (${session.overcurrentCount})`
          : 'No',
        hasAlert: session.hasAlert ? 'Yes' : 'No',
        status: session.status,
      });
    }

    // Footer row with totals
    const { summary } = report;
    const footerRow = sheet.addRow({
      sessionNumber: 'TOTAL',
      startedAt: `${summary.totalSessions} sessions`,
      duration: +(summary.totalDurationHours * 60).toFixed(1),
      tempMin: summary.tempRange?.min ?? '',
      tempMax: summary.tempRange?.max ?? '',
      currentMin: summary.currentRange?.min ?? '',
      currentMax: summary.currentRange?.max ?? '',
      overcurrent: `${summary.overcurrentSessions} sessions`,
    });

    footerRow.font = { bold: true };
    footerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' },
    };
  }
}
