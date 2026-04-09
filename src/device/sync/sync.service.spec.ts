import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SyncService } from './sync.service';
import { MqttService } from '../mqtt/mqtt.service';
import { DeviceGateway } from '../websocket/device.gateway';
import { ProvisionService } from 'src/provision/provision.service';
import { Device } from '../entities/device.entity';

describe('SyncService — fertilizer guard', () => {
  let service: SyncService;

  const mockDeviceRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const mockMqttService = {
    publishToDevice: jest.fn(),
    onMessage: jest.fn(),
    isDeviceConnected: jest.fn(),
  };
  const mockDeviceGateway = {
    broadcastDeviceStatus: jest.fn(),
    broadcastDeviceData: jest.fn(),
    broadcast: jest.fn(),
  };
  const mockProvisionService = { handleProvisionRequest: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Seed cache bypass: return farmId for any deviceId
    mockDeviceRepo.findOne.mockResolvedValue({
      id: 'device-1',
      farmId: 'farm-1',
      zoneId: null,
      gatewayId: null,
      serial: null,
      hasFertilizer: false,
    } as Partial<Device>);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: MqttService, useValue: mockMqttService },
        { provide: DeviceGateway, useValue: mockDeviceGateway },
        { provide: ProvisionService, useValue: mockProvisionService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: getRepositoryToken(Device), useValue: mockDeviceRepo },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('sendCommandToDevice', () => {
    it('throws BadRequestException when hasFertilizer=false and command is fertilizer_on', async () => {
      // deviceRepo.findOne is called twice: once for getDeviceIds cache miss, once for fertilizer guard
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: null,
        serial: null,
        hasFertilizer: false,
      });

      await expect(
        service.sendCommandToDevice('device-1', 'fertilizer_on', {}),
      ).rejects.toThrow(BadRequestException);

      expect(mockMqttService.publishToDevice).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when hasFertilizer=false and command is fertilizer_off', async () => {
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: null,
        serial: null,
        hasFertilizer: false,
      });

      await expect(
        service.sendCommandToDevice('device-1', 'fertilizer_off', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('proceeds when hasFertilizer=true and command is fertilizer_on', async () => {
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: null,
        serial: null,
        hasFertilizer: true,
      });
      mockMqttService.publishToDevice.mockResolvedValue(undefined);

      const result = await service.sendCommandToDevice(
        'device-1',
        'fertilizer_on',
        {},
      );

      expect(result).toEqual({
        success: true,
        message: 'Command sent to device',
      });
      expect(mockMqttService.publishToDevice).toHaveBeenCalledWith(
        'device-1',
        'fertilizer_on',
        {},
        null, // WiFi device — no gatewayId
        null, // no serial
      );
    });

    it('does not check hasFertilizer for non-fertilizer commands', async () => {
      // Only one findOne call (for getDeviceIds cache miss), not a second one for guard
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: null,
        serial: null,
        hasFertilizer: false,
      });
      mockMqttService.publishToDevice.mockResolvedValue(undefined);

      const result = await service.sendCommandToDevice(
        'device-1',
        'pump_on',
        {},
      );

      expect(result).toEqual({
        success: true,
        message: 'Command sent to device',
      });
      expect(mockMqttService.publishToDevice).toHaveBeenCalledWith(
        'device-1',
        'pump_on',
        {},
        null, // WiFi device — no gatewayId
        null, // no serial
      );
    });
  });

  describe('sendCommandToDevice — topic routing', () => {
    it('routes via device/{id}/cmd when gatewayId is null (WiFi direct)', async () => {
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: null,
        serial: null,
        hasFertilizer: false,
      });
      mockMqttService.publishToDevice.mockResolvedValue(undefined);

      await service.sendCommandToDevice('device-1', 'pump_on', {});

      expect(mockMqttService.publishToDevice).toHaveBeenCalledWith(
        'device-1',
        'pump_on',
        {},
        null,
        null,
      );
    });

    it('routes via gateway/{gwId}/device/{id}/cmd when gatewayId is set (LoRa mode) with serial', async () => {
      mockDeviceRepo.findOne.mockResolvedValue({
        farmId: 'farm-1',
        zoneId: null,
        gatewayId: 'gw-abc',
        serial: 'SN-12345',
        hasFertilizer: false,
      });
      mockMqttService.publishToDevice.mockResolvedValue(undefined);

      await service.sendCommandToDevice('device-1', 'pump_on', {});

      expect(mockMqttService.publishToDevice).toHaveBeenCalledWith(
        'device-1',
        'pump_on',
        {},
        'gw-abc',
        'SN-12345',
      );
    });
  });
});
