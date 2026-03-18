import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import { PumpSession } from './entities/pump-session.entity';
import { PumpSessionStatus } from './enums/pump-session-status.enum';
import { InterruptedReason } from './enums/interrupted-reason.enum';
import { PumpOperationMode } from './enums/pump-operation-mode.enum';
import { PumpControlMode } from './enums/pump-control-mode.enum';
import { PumpReportQueryDto } from './dto/pump-report-query.dto';
import { Device } from 'src/device/entities/device.entity';
import { SensorData } from 'src/sensor/entities/sensor-data.entity';
import { AlertLog } from 'src/sensor/entities/alert-log.entity';
import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';
import { TimeBucket } from 'src/sensor/enums/time-bucket.enum';
import { MqttService } from 'src/device/mqtt/mqtt.service';
import { DeviceGateway } from 'src/device/websocket/device.gateway';

// Pump event interfaces
export interface PumpStartedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
  irrigationMode?: string;
  controlMode?: string;
}

export interface PumpStoppedEvent {
  deviceId: string;
  farmId?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface PumpDisconnectedEvent {
  deviceId: string;
  farmId?: string;
  timestamp: Date;
}

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name);
  private executing = false;

  constructor(
    @InjectRepository(PumpSession)
    private readonly pumpSessionRepo: Repository<PumpSession>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(SensorData)
    private readonly sensorDataRepo: Repository<SensorData>,
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    private readonly mqttService: MqttService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // --- Phase 3: Session Lifecycle ---

  @OnEvent('pump.started')
  async handlePumpStarted(event: PumpStartedEvent) {
    const { deviceId, timestamp } = event;

    try {
      // Check for existing active session (server restart case)
      const existing = await this.pumpSessionRepo.findOne({
        where: { deviceId, status: PumpSessionStatus.ACTIVE },
      });

      if (existing) {
        this.logger.log(
          `Reusing active session ${existing.id} for device ${deviceId}`,
        );
        // Re-publish sessionId to ESP (it may have rebooted)
        await this.publishSessionId(deviceId, existing.id);
        return;
      }

      // Get next session number
      const maxResult = await this.pumpSessionRepo
        .createQueryBuilder('ps')
        .select('MAX(ps.sessionNumber)', 'max')
        .where('ps.deviceId = :deviceId', { deviceId })
        .getRawOne();

      const sessionNumber = (maxResult?.max || 0) + 1;

      // Validate irrigation mode (fallback to NORMAL if invalid/missing)
      const validIrrigationModes = Object.values(PumpOperationMode);
      const irrigationMode = validIrrigationModes.includes(
        event.irrigationMode as PumpOperationMode,
      )
        ? (event.irrigationMode as PumpOperationMode)
        : PumpOperationMode.NORMAL;

      // Validate control mode (fallback to MANUAL if invalid/missing)
      const validControlModes = Object.values(PumpControlMode);
      const controlMode = validControlModes.includes(
        event.controlMode as PumpControlMode,
      )
        ? (event.controlMode as PumpControlMode)
        : PumpControlMode.MANUAL;

      // Create new session
      const session = this.pumpSessionRepo.create({
        deviceId,
        sessionNumber,
        startedAt: timestamp,
        irrigationMode,
        controlMode,
        status: PumpSessionStatus.ACTIVE,
      });

      const saved = await this.pumpSessionRepo.save(session);

      this.logger.log(
        `Session #${sessionNumber} started for device ${deviceId} (id=${saved.id})`,
      );

      // Publish session ID to ESP
      await this.publishSessionId(deviceId, saved.id);

      // Broadcast to WebSocket
      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'pump_session_started',
          sessionId: saved.id,
          sessionNumber,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling pump.started for device ${deviceId}:`,
        error,
      );
    }
  }

  @OnEvent('pump.stopped')
  async handlePumpStopped(event: PumpStoppedEvent) {
    const { deviceId, sessionId, timestamp } = event;

    try {
      let session: PumpSession;

      if (sessionId) {
        // Normal stop -- find by sessionId
        session = await this.pumpSessionRepo.findOne({
          where: { id: sessionId, status: PumpSessionStatus.ACTIVE },
        });

        if (!session) {
          this.logger.warn(
            `No active session found with id=${sessionId} for device ${deviceId}`,
          );
          return;
        }

        await this.closeSession(
          session,
          timestamp,
          PumpSessionStatus.COMPLETED,
        );
      } else {
        // ESP reboot -- no sessionId, find active by deviceId
        session = await this.pumpSessionRepo.findOne({
          where: { deviceId, status: PumpSessionStatus.ACTIVE },
        });

        if (!session) {
          this.logger.debug(
            `No active session for device ${deviceId} on pump.stopped (no sessionId)`,
          );
          return;
        }

        await this.closeSession(
          session,
          timestamp,
          PumpSessionStatus.INTERRUPTED,
          InterruptedReason.ESP_REBOOT,
        );
      }

      // Broadcast to WebSocket
      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'pump_session_ended',
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          status: session.status,
          durationSeconds: session.durationSeconds,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling pump.stopped for device ${deviceId}:`,
        error,
      );
    }
  }

  @OnEvent('pump.disconnected')
  async handlePumpDisconnected(event: PumpDisconnectedEvent) {
    const { deviceId } = event;

    try {
      const session = await this.pumpSessionRepo.findOne({
        where: { deviceId, status: PumpSessionStatus.ACTIVE },
      });

      if (!session) {
        this.logger.debug(
          `No active session for device ${deviceId} on LWT disconnect`,
        );
        return;
      }

      // endedAt = last sensor data timestamp for this device
      const lastData = await this.getLastSensorTimestamp(deviceId);
      const endedAt = lastData || event.timestamp;

      await this.closeSession(
        session,
        endedAt,
        PumpSessionStatus.INTERRUPTED,
        InterruptedReason.LWT,
      );

      this.logger.log(
        `Session ${session.id} closed as LWT for device ${deviceId}`,
      );

      this.deviceGateway.broadcastDeviceData(
        deviceId,
        {
          type: 'pump_session_ended',
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          status: PumpSessionStatus.INTERRUPTED,
          reason: InterruptedReason.LWT,
        },
        event.farmId,
      );
    } catch (error) {
      this.logger.error(
        `Error handling pump.disconnected for device ${deviceId}:`,
        error,
      );
    }
  }

  private async publishSessionId(deviceId: string, sessionId: string) {
    try {
      await this.mqttService.publishToTopic(`device/${deviceId}/session`, {
        sessionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish sessionId to device ${deviceId}:`,
        error,
      );
    }
  }

  private async closeSession(
    session: PumpSession,
    endedAt: Date,
    status: PumpSessionStatus,
    reason?: InterruptedReason,
  ) {
    session.endedAt = endedAt;
    session.status = status;
    session.interruptedReason = reason || null;
    session.durationSeconds =
      (endedAt.getTime() - session.startedAt.getTime()) / 1000;

    // Compute sensor aggregates
    await this.computeSessionAggregates(session);

    // Compute overcurrent data
    await this.computeOvercurrentData(session);

    await this.pumpSessionRepo.save(session);

    // Only update totalOperatingHours for completed sessions
    if (status === PumpSessionStatus.COMPLETED && session.durationSeconds > 0) {
      const durationHours = session.durationSeconds / 3600;
      await this.deviceRepo
        .createQueryBuilder()
        .update(Device)
        .set({
          totalOperatingHours: () => `"totalOperatingHours" + ${durationHours}`,
        })
        .where('id = :id', { id: session.deviceId })
        .execute();

      this.logger.log(
        `Device ${
          session.deviceId
        } totalOperatingHours += ${durationHours.toFixed(2)}h`,
      );
    }
  }

  private async computeSessionAggregates(session: PumpSession) {
    const { deviceId, startedAt, endedAt } = session;

    // Temperature aggregates
    const tempStats = await this.getSensorAggregates(
      deviceId,
      SensorType.PUMP_TEMPERATURE,
      startedAt,
      endedAt,
    );
    if (tempStats) {
      session.tempMin = tempStats.min;
      session.tempMax = tempStats.max;
      session.tempAvg = tempStats.avg;
    }

    // Pressure aggregates
    const pressureStats = await this.getSensorAggregates(
      deviceId,
      SensorType.WATER_PRESSURE,
      startedAt,
      endedAt,
    );
    if (pressureStats) {
      session.pressureMin = pressureStats.min;
      session.pressureMax = pressureStats.max;
      session.pressureAvg = pressureStats.avg;
    }

    // Flow aggregates (uses SUM for total)
    const flowStats = await this.getSensorAggregates(
      deviceId,
      SensorType.WATER_FLOW,
      startedAt,
      endedAt,
    );
    if (flowStats) {
      session.flowMin = flowStats.min;
      session.flowMax = flowStats.max;
      session.flowTotal = flowStats.sum;
    }

    // Current aggregates
    const currentStats = await this.getSensorAggregates(
      deviceId,
      SensorType.ELECTRICAL_CURRENT,
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
        sensorType: SensorType.ELECTRICAL_PHASE,
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
  ): Promise<{ min: number; max: number; avg: number; sum: number } | null> {
    const result = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .addSelect('SUM(sd.value)', 'sum')
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
      sum: parseFloat(result.sum),
    };
  }

  private async computeOvercurrentData(session: PumpSession) {
    const { deviceId, startedAt, endedAt } = session;

    // Query AlertLog for electrical_current CRITICAL alerts during session
    const overcurrentAlerts = await this.alertLogRepo
      .createQueryBuilder('al')
      .where('al.deviceId = :deviceId', { deviceId })
      .andWhere('al.sensorType = :sensorType', {
        sensorType: SensorType.ELECTRICAL_CURRENT,
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

    // Also check for any alerts (not just overcurrent)
    if (!session.hasAlert) {
      const anyAlert = await this.alertLogRepo
        .createQueryBuilder('al')
        .where('al.deviceId = :deviceId', { deviceId })
        .andWhere('al.createdAt >= :from', { from: startedAt })
        .andWhere('al.createdAt <= :to', { to: endedAt })
        .getCount();

      session.hasAlert = anyAlert > 0;
    }
  }

  private async getLastSensorTimestamp(deviceId: string): Promise<Date | null> {
    const result = await this.sensorDataRepo
      .createQueryBuilder('sd')
      .select('MAX(sd.createdAt)', 'lastAt')
      .where('sd.deviceId = :deviceId', { deviceId })
      .getRawOne();

    return result?.lastAt ? new Date(result.lastAt) : null;
  }

  // --- Phase 4: Stale Session Cron ---

  @Interval(60_000)
  async cleanupStaleSessions() {
    if (this.executing) return;
    this.executing = true;

    try {
      // Find all active sessions
      const activeSessions = await this.pumpSessionRepo.find({
        where: { status: PumpSessionStatus.ACTIVE },
      });

      if (activeSessions.length === 0) return;

      const now = Date.now();
      const STALE_THRESHOLD_MS = 30_000;

      for (const session of activeSessions) {
        try {
          // Check for recent sensor data for this device
          const recentData = await this.sensorDataRepo
            .createQueryBuilder('sd')
            .select('MAX(sd.createdAt)', 'lastAt')
            .where('sd.deviceId = :deviceId', { deviceId: session.deviceId })
            .getRawOne();

          const lastDataTime = recentData?.lastAt
            ? new Date(recentData.lastAt).getTime()
            : null;

          // If no data at all, or last data is older than 30s
          if (!lastDataTime || now - lastDataTime > STALE_THRESHOLD_MS) {
            const endedAt = lastDataTime
              ? new Date(lastDataTime)
              : session.startedAt;

            await this.closeSession(
              session,
              endedAt,
              PumpSessionStatus.INTERRUPTED,
              InterruptedReason.TIMEOUT,
            );

            this.logger.warn(
              `Stale session ${session.id} (device ${session.deviceId}) closed as timeout`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error checking stale session ${session.id}:`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error in cleanupStaleSessions:', error);
    } finally {
      this.executing = false;
    }
  }

  // --- Phase 5: Report API ---

  async getReport(deviceId: string, query: PumpReportQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();

    const [summary, maintenanceInfo, timeline, sessions] = await Promise.all([
      this.getSummary(deviceId, from, to),
      this.getMaintenanceInfo(deviceId),
      this.getTimeline(deviceId, from, to),
      this.getSessions(deviceId, from, to),
    ]);

    return { summary, maintenanceInfo, timeline, sessions };
  }

  private async getSummary(deviceId: string, from: Date, to: Date) {
    const [result, modeBreakdown] = await Promise.all([
      this.pumpSessionRepo
        .createQueryBuilder('ps')
        .select('COUNT(*)', 'totalSessions')
        .addSelect('SUM(ps.durationSeconds)', 'totalDurationSeconds')
        .addSelect('AVG(ps.durationSeconds)', 'avgDurationSeconds')
        .addSelect('SUM(ps.flowTotal)', 'totalFlow')
        .addSelect('MIN(ps.tempMin)', 'tempMin')
        .addSelect('MAX(ps.tempMax)', 'tempMax')
        .addSelect('MIN(ps.pressureMin)', 'pressureMin')
        .addSelect('MAX(ps.pressureMax)', 'pressureMax')
        .addSelect('MIN(ps.currentMin)', 'currentMin')
        .addSelect('MAX(ps.currentMax)', 'currentMax')
        .addSelect(
          'SUM(CASE WHEN ps.overcurrentDetected = true THEN 1 ELSE 0 END)',
          'overcurrentSessions',
        )
        .addSelect('SUM(ps.overcurrentCount)', 'overcurrentTotalCount')
        .where('ps.deviceId = :deviceId', { deviceId })
        .andWhere('ps.startedAt >= :from', { from })
        .andWhere('ps.startedAt <= :to', { to })
        .getRawOne(),
      this.pumpSessionRepo
        .createQueryBuilder('ps')
        .select('ps.irrigationMode', 'mode')
        .addSelect('COUNT(*)', 'count')
        .where('ps.deviceId = :deviceId', { deviceId })
        .andWhere('ps.startedAt >= :from AND ps.startedAt <= :to', { from, to })
        .groupBy('ps.irrigationMode')
        .getRawMany(),
    ]);

    const totalSeconds = parseFloat(result.totalDurationSeconds) || 0;

    return {
      totalSessions: parseInt(result.totalSessions, 10),
      totalDurationHours: +(totalSeconds / 3600).toFixed(2),
      avgDurationMinutes: +(
        (parseFloat(result.avgDurationSeconds) || 0) / 60
      ).toFixed(1),
      totalFlow: parseFloat(result.totalFlow) || 0,
      tempRange: {
        min: parseFloat(result.tempMin) ?? null,
        max: parseFloat(result.tempMax) ?? null,
      },
      pressureRange: {
        min: parseFloat(result.pressureMin) ?? null,
        max: parseFloat(result.pressureMax) ?? null,
      },
      currentRange: {
        min: parseFloat(result.currentMin) ?? null,
        max: parseFloat(result.currentMax) ?? null,
      },
      overcurrentSessions: parseInt(result.overcurrentSessions, 10) || 0,
      overcurrentTotalCount: parseInt(result.overcurrentTotalCount, 10) || 0,
      modeBreakdown: modeBreakdown.map((r) => ({
        mode: r.mode,
        count: parseInt(r.count, 10),
      })),
    };
  }

  private async getMaintenanceInfo(deviceId: string) {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });

    if (!device) return null;

    const totalHours = device.totalOperatingHours || 0;
    const lifeHours = device.operatingLifeHours;

    if (!lifeHours) {
      return {
        operatingLifeHours: null,
        totalOperatingHours: totalHours,
        usagePercent: null,
        warningThreshold: 80,
        isWarning: false,
        isRequired: false,
      };
    }

    const usagePercent = +((totalHours / lifeHours) * 100).toFixed(1);

    return {
      operatingLifeHours: lifeHours,
      totalOperatingHours: +totalHours.toFixed(2),
      usagePercent,
      warningThreshold: 80,
      isWarning: usagePercent >= 80,
      isRequired: usagePercent >= 100,
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

    const rows = await this.pumpSessionRepo
      .createQueryBuilder('ps')
      .select(`DATE_TRUNC(:bucket, ps.startedAt)`, 'bucket')
      .addSelect('COUNT(*)', 'sessionCount')
      .addSelect('SUM(ps.durationSeconds)', 'totalDurationSeconds')
      .addSelect('AVG(ps.durationSeconds)', 'avgDurationSeconds')
      .addSelect('SUM(ps.flowTotal)', 'totalFlow')
      .setParameter('bucket', bucket)
      .where('ps.deviceId = :deviceId', { deviceId })
      .andWhere('ps.startedAt >= :from', { from })
      .andWhere('ps.startedAt <= :to', { to })
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
        totalFlow: parseFloat(r.totalFlow) || 0,
      })),
    };
  }

  private async getSessions(deviceId: string, from: Date, to: Date) {
    return this.pumpSessionRepo.find({
      where: {
        deviceId,
        startedAt: MoreThanOrEqual(from),
      },
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  // --- Phase 6: Excel Export ---

  async getReportExcel(
    deviceId: string,
    query: PumpReportQueryDto,
  ): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const report = await this.getReport(deviceId, query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QS Farm';
    workbook.created = new Date();

    // Sheet 1: Pump Sessions
    this.buildSessionsSheet(workbook, report);

    // Sheet 2: Maintenance (conditional)
    if (
      report.maintenanceInfo?.isWarning ||
      report.maintenanceInfo?.isRequired
    ) {
      this.buildMaintenanceSheet(workbook, report.maintenanceInfo);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  private buildSessionsSheet(workbook: any, report: any) {
    const sheet = workbook.addWorksheet('Pump Sessions');

    const MODE_LABELS: Record<string, string> = {
      [PumpOperationMode.NORMAL]: 'Binh thuong',
      [PumpOperationMode.SPRAY]: 'Phun mua',
      [PumpOperationMode.ROOT]: 'Tuoi goc',
      [PumpOperationMode.DRIP]: 'Nho giot',
    };

    sheet.columns = [
      { header: 'Session #', key: 'sessionNumber', width: 12 },
      { header: 'Irrigation Mode', key: 'irrigationMode', width: 16 },
      { header: 'Control Mode', key: 'controlMode', width: 14 },
      { header: 'Start', key: 'startedAt', width: 20 },
      { header: 'End', key: 'endedAt', width: 20 },
      { header: 'Duration (min)', key: 'duration', width: 15 },
      { header: 'Temp Min', key: 'tempMin', width: 12 },
      { header: 'Temp Max', key: 'tempMax', width: 12 },
      { header: 'Pressure Min', key: 'pressureMin', width: 14 },
      { header: 'Pressure Max', key: 'pressureMax', width: 14 },
      { header: 'Flow Total', key: 'flowTotal', width: 12 },
      { header: 'Current Max', key: 'currentMax', width: 13 },
      { header: 'Overcurrent', key: 'overcurrent', width: 13 },
      { header: 'Phase Count', key: 'phaseCount', width: 13 },
      { header: 'Alert', key: 'hasAlert', width: 8 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    const CONTROL_MODE_LABELS: Record<string, string> = {
      [PumpControlMode.MANUAL]: 'Thu cong',
      [PumpControlMode.AUTO]: 'Tu dong',
      [PumpControlMode.SCHEDULE]: 'Hen gio',
    };

    // Data rows
    for (const session of report.sessions) {

      sheet.addRow({
        sessionNumber: session.sessionNumber,
        irrigationMode:
          MODE_LABELS[session.irrigationMode] || session.irrigationMode || '',
        controlMode:
          CONTROL_MODE_LABELS[session.controlMode] ||
          session.controlMode ||
          '',
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
        pressureMin: session.pressureMin ?? '',
        pressureMax: session.pressureMax ?? '',
        flowTotal: session.flowTotal ?? '',
        currentMax: session.currentMax ?? '',
        overcurrent: session.overcurrentDetected
          ? `Yes (${session.overcurrentCount})`
          : 'No',
        phaseCount: session.phaseCount ?? '',
        hasAlert: session.hasAlert ? 'Yes' : 'No',
        status: session.status,
      });
    }

    // Footer row with totals
    const { summary } = report;
    const footerRow = sheet.addRow({
      sessionNumber: 'TOTAL',
      startedAt: `${summary.totalSessions} sessions`,
      endedAt: '',
      duration: +(summary.totalDurationHours * 60).toFixed(1),
      tempMin: summary.tempRange?.min ?? '',
      tempMax: summary.tempRange?.max ?? '',
      pressureMin: summary.pressureRange?.min ?? '',
      pressureMax: summary.pressureRange?.max ?? '',
      flowTotal: summary.totalFlow,
      currentMax: summary.currentRange?.max ?? '',
      overcurrent: `${summary.overcurrentSessions} sessions`,
      phaseCount: '',
      hasAlert: '',
      status: '',
    });

    footerRow.font = { bold: true };
    footerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' },
    };
  }

  private buildMaintenanceSheet(workbook: any, info: any) {
    const sheet = workbook.addWorksheet('Maintenance');

    sheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Value', key: 'value', width: 30 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    sheet.addRow({
      field: 'Operating Life (hours)',
      value: info.operatingLifeHours,
    });
    sheet.addRow({
      field: 'Total Operating Hours',
      value: info.totalOperatingHours,
    });
    sheet.addRow({ field: 'Usage (%)', value: `${info.usagePercent}%` });
    sheet.addRow({
      field: 'Warning Threshold',
      value: `${info.warningThreshold}%`,
    });

    const statusRow = sheet.addRow({
      field: 'Status',
      value: info.isRequired
        ? 'MAINTENANCE REQUIRED'
        : info.isWarning
        ? 'MAINTENANCE WARNING'
        : 'OK',
    });

    if (info.isRequired) {
      statusRow.getCell('value').font = {
        bold: true,
        color: { argb: 'FFFF0000' },
      };
    } else if (info.isWarning) {
      statusRow.getCell('value').font = {
        bold: true,
        color: { argb: 'FFFF8C00' },
      };
    }

    sheet.addRow({});
    sheet.addRow({
      field: 'Recommendation',
      value: info.isRequired
        ? 'Device has exceeded operating life. Schedule maintenance immediately.'
        : 'Device is approaching operating life limit. Plan maintenance soon.',
    });
  }
}
