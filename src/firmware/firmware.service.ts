import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';

import { Firmware } from './entities/firmware.entity';
import { FirmwareUpdateLog } from './entities/firmware-update-log.entity';
import { UploadFirmwareDto } from './dto/upload-firmware.dto';
import { UpdateFirmwareDto } from './dto/update-firmware.dto';
import { DeviceGateway } from 'src/device/websocket/device.gateway';
import { DeviceService } from 'src/device/device.service';
import { SyncService } from 'src/device/sync/sync.service';
import { CheckUpdateQueryDto } from './dto/check-update-query.dto';
import { DeployFirmwareDto } from './dto/deploy-firmware.dto';
import { FirmwareUpdateStatus } from './entities/firmware-update-log.entity';
import { DeviceStatus } from 'src/device/entities/device.entity';
import { FarmService } from 'src/farm/farm.service';

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);

  constructor(
    @InjectRepository(Firmware)
    private readonly firmwareRepository: Repository<Firmware>,
    @InjectRepository(FirmwareUpdateLog)
    private readonly updateLogRepository: Repository<FirmwareUpdateLog>,
    private readonly deviceGateway: DeviceGateway,
    private readonly deviceService: DeviceService,
    private readonly syncService: SyncService,
    private readonly farmService: FarmService,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: UploadFirmwareDto,
    userId: string,
  ) {
    // Check duplicate version
    const existing = await this.firmwareRepository.findOne({
      where: { version: dto.version },
    });
    if (existing) {
      // Clean up uploaded file
      try {
        unlinkSync(file.path);
      } catch {}
      throw new ConflictException(
        `Firmware version ${dto.version} already exists`,
      );
    }

    // Compute MD5 checksum
    const fileBuffer = readFileSync(file.path);
    const checksum = createHash('md5')
      .update(Uint8Array.from(fileBuffer))
      .digest('hex');

    const firmware = this.firmwareRepository.create({
      version: dto.version,
      hardwareModel: dto.hardwareModel,
      releaseNotes: dto.releaseNotes,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      checksum,
      createdBy: userId,
    });

    const saved = await this.firmwareRepository.save(firmware);
    this.logger.log(`Firmware ${dto.version} uploaded (${checksum})`);
    return saved;
  }

  async findAll(hardwareModel?: string) {
    const where = hardwareModel ? { hardwareModel } : {};
    return this.firmwareRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const firmware = await this.firmwareRepository.findOne(id);
    if (!firmware) {
      throw new NotFoundException(`Firmware ${id} not found`);
    }
    return firmware;
  }

  async findLatestPublished(hardwareModel: string) {
    return this.firmwareRepository.findOne({
      where: { hardwareModel, isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, dto: UpdateFirmwareDto) {
    const firmware = await this.findOne(id);

    // Handle publish transition
    if (dto.isPublished && !firmware.isPublished) {
      firmware.isPublished = true;
      firmware.publishedAt = new Date();
      if (dto.releaseNotes !== undefined) {
        firmware.releaseNotes = dto.releaseNotes;
      }
      const saved = await this.firmwareRepository.save(firmware);
      this.broadcastFirmwarePublished(saved);
      return saved;
    }

    Object.assign(firmware, dto);
    return this.firmwareRepository.save(firmware);
  }

  async publish(id: string) {
    const firmware = await this.findOne(id);
    if (firmware.isPublished) return firmware;

    firmware.isPublished = true;
    firmware.publishedAt = new Date();
    const saved = await this.firmwareRepository.save(firmware);
    this.broadcastFirmwarePublished(saved);
    return saved;
  }

  async unpublish(id: string) {
    const firmware = await this.findOne(id);
    firmware.isPublished = false;
    firmware.publishedAt = null;
    return this.firmwareRepository.save(firmware);
  }

  private broadcastFirmwarePublished(firmware: Firmware) {
    this.deviceGateway.broadcast('firmwarePublished', {
      id: firmware.id,
      version: firmware.version,
      hardwareModel: firmware.hardwareModel,
      releaseNotes: firmware.releaseNotes,
      publishedAt: firmware.publishedAt,
    });
    this.logger.log(`Firmware ${firmware.version} published and broadcast`);
  }

  async checkForUpdate(query: CheckUpdateQueryDto) {
    let hardwareModel = query.hardwareModel;

    if (query.deviceId) {
      const device = await this.deviceService.findOne(query.deviceId);
      hardwareModel = hardwareModel || device.hardwareVersion;
    }

    if (!hardwareModel) {
      return { updateAvailable: false };
    }

    const latest = await this.findLatestPublished(hardwareModel);

    if (!latest || latest.version === query.currentVersion) {
      return { updateAvailable: false };
    }

    return {
      updateAvailable: true,
      id: latest.id,
      version: latest.version,
      downloadUrl: `/api/firmware/download/${latest.id}`,
      checksum: latest.checksum,
      checksumAlgorithm: 'md5',
      fileSize: latest.fileSize,
      releaseNotes: latest.releaseNotes,
    };
  }

  async deploy(firmwareId: string, dto: DeployFirmwareDto) {
    const firmware = await this.findOne(firmwareId);

    // Resolve target devices
    let devices;
    if (dto.farmId) {
      devices = await this.deviceService.findAll(dto.farmId);
    } else if (dto.deviceIds?.length) {
      devices = await Promise.all(
        dto.deviceIds.map((id) => this.deviceService.findOne(id)),
      );
    } else {
      throw new BadRequestException('Provide deviceIds or farmId');
    }

    // Filter only ACTIVE devices
    const activeDevices = devices.filter(
      (d) => d.status === DeviceStatus.ACTIVE,
    );

    const results = [];

    for (const device of activeDevices) {
      // Create update log
      const log = await this.updateLogRepository.save(
        this.updateLogRepository.create({
          firmwareId: firmware.id,
          deviceId: device.id,
          previousVersion: device.firmwareVersion,
          status: FirmwareUpdateStatus.PENDING,
        }),
      );

      // Send OTA command via MQTT
      try {
        await this.syncService.sendCommandToDevice(device.id, 'OTA_UPDATE', {
          version: firmware.version,
          downloadUrl: `/api/firmware/download/${firmware.id}`,
          checksum: firmware.checksum,
          checksumAlgorithm: 'md5',
          fileSize: firmware.fileSize,
        });
        results.push({ deviceId: device.id, logId: log.id, status: 'sent' });
      } catch (error) {
        log.status = FirmwareUpdateStatus.FAILED;
        log.errorMessage = error.message;
        await this.updateLogRepository.save(log);
        results.push({
          deviceId: device.id,
          logId: log.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Broadcast firmwareDeploying to WebSocket per device
    for (const device of activeDevices) {
      this.deviceGateway.broadcastDeviceStatus(device.id, {
        type: 'firmwareDeploying',
        firmwareVersion: firmware.version,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      firmwareId: firmware.id,
      version: firmware.version,
      totalTargeted: devices.length,
      totalActive: activeDevices.length,
      results,
    };
  }

  @OnEvent('firmware.update.reported')
  async handleUpdateReport(data: {
    deviceId: string;
    version: string;
    success: boolean;
    errorMessage?: string;
    duration?: number;
    previousVersion?: string;
  }) {
    // Find the pending log for this device
    const log = await this.updateLogRepository.findOne({
      where: { deviceId: data.deviceId, status: FirmwareUpdateStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    if (log) {
      log.status = data.success
        ? FirmwareUpdateStatus.SUCCESS
        : FirmwareUpdateStatus.FAILED;
      log.errorMessage = data.errorMessage;
      log.duration = data.duration;
      log.reportedAt = new Date();
      await this.updateLogRepository.save(log);
    }

    // Update device firmware version on success
    if (data.success) {
      await this.deviceService.update(data.deviceId, {
        firmwareVersion: data.version,
      } as any);
    }

    // Broadcast status to WebSocket
    this.deviceGateway.broadcastDeviceStatus(data.deviceId, {
      type: 'firmwareUpdateStatus',
      version: data.version,
      status: data.success ? 'success' : 'failed',
      errorMessage: data.errorMessage,
      duration: data.duration,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Firmware update report: device=${data.deviceId} version=${data.version} success=${data.success}`,
    );
  }

  async deployForUser(
    firmwareId: string,
    dto: DeployFirmwareDto,
    userId: string,
  ) {
    if (dto.farmId) {
      const farm = await this.farmService.findOne(dto.farmId);
      if (farm.userId !== userId) {
        throw new ForbiddenException('You do not own this farm');
      }
    } else if (dto.deviceIds?.length) {
      const devices = await Promise.all(
        dto.deviceIds.map((id) => this.deviceService.findOne(id)),
      );
      for (const device of devices) {
        if (!device.farm || device.farm.userId !== userId) {
          throw new ForbiddenException(`Device ${device.id} not owned by you`);
        }
      }
    } else {
      throw new BadRequestException('Provide deviceIds or farmId');
    }

    return this.deploy(firmwareId, dto);
  }

  @OnEvent('firmware.update.requested')
  async handleMobileUpdateRequest(data: {
    firmwareId: string;
    deviceIds?: string[];
    farmId?: string;
    userId: string;
    socketId: string;
  }) {
    try {
      const result = await this.deployForUser(
        data.firmwareId,
        { deviceIds: data.deviceIds, farmId: data.farmId },
        data.userId,
      );

      this.deviceGateway.server
        .to(data.socketId)
        .emit('firmwareUpdateAck', result);
    } catch (error) {
      this.deviceGateway.server
        .to(data.socketId)
        .emit('firmwareUpdateError', { message: error.message });
    }
  }

  async getUpdateLogs(filters: { deviceId?: string; firmwareId?: string }) {
    const where: any = {};
    if (filters.deviceId) where.deviceId = filters.deviceId;
    if (filters.firmwareId) where.firmwareId = filters.firmwareId;

    return this.updateLogRepository.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['firmware', 'device'],
    });
  }

  async remove(id: string) {
    const firmware = await this.findOne(id);

    // Delete file from disk
    try {
      unlinkSync(firmware.filePath);
    } catch {}

    return this.firmwareRepository.remove(firmware);
  }
}
