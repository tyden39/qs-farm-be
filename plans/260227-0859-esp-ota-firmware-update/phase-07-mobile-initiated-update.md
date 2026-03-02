# Phase 7: Mobile-Initiated Firmware Update

**Priority:** High | **Effort:** Small | **Status:** Pending

## Overview

Mobile app receives `firmwarePublished` WebSocket notification (Phase 3), then user triggers firmware update for their devices via a new WebSocket event. Server validates ownership, deploys firmware, and streams real-time progress back to the mobile client.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 3: Publish & Notify](./phase-03-publish-websocket-notify.md) — incoming notification
- [Phase 5: Deploy via MQTT](./phase-05-deploy-mqtt.md) — reuse deploy logic
- Existing: `src/device/websocket/device.gateway.ts` — WebSocket handler pattern

## Architecture

```
Mobile App Flow:
────────────────

1. ← firmwarePublished { id, version, hardwareModel, releaseNotes }
   (user sees: "New firmware v1.3.0 available!")

2. → requestFirmwareUpdate { firmwareId, deviceIds? | farmId? }
   (user taps "Update" for selected devices or entire farm)

3. ← firmwareUpdateAck { firmwareId, totalDevices, status: 'deploying' }
   (immediate acknowledgement)

4. ← deviceStatus { type: 'firmwareDeploying', ... }  (per device)
   ← deviceStatus { type: 'firmwareUpdateStatus', status: 'success' }
   (real-time progress per device, received on device rooms)
```

## Related Code Files

**Modify:**
- `src/device/websocket/device.gateway.ts` — add `requestFirmwareUpdate` handler
- `src/firmware/firmware.service.ts` — add ownership-validated deploy method

## Implementation Steps

### 1. Add WebSocket event handler in DeviceGateway

Add a new `@SubscribeMessage('requestFirmwareUpdate')` handler. The user is already authenticated via JWT on WebSocket handshake, so `client.data.userId` is available.

```typescript
@SubscribeMessage('requestFirmwareUpdate')
async handleRequestFirmwareUpdate(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { firmwareId: string; deviceIds?: string[]; farmId?: string },
) {
  const userId = client.data.userId;
  if (!userId) {
    return { event: 'error', data: { message: 'Not authenticated' } };
  }

  try {
    const result = await this.firmwareService.deployForUser(
      data.firmwareId,
      { deviceIds: data.deviceIds, farmId: data.farmId },
      userId,
    );

    return {
      event: 'firmwareUpdateAck',
      data: result,
    };
  } catch (error) {
    return {
      event: 'firmwareUpdateError',
      data: { message: error.message },
    };
  }
}
```

### 2. Add `deployForUser()` in FirmwareService

Wrapper around existing `deploy()` that validates user ownership:

```typescript
async deployForUser(firmwareId: string, dto: DeployFirmwareDto, userId: string) {
  // Resolve devices
  let devices: Device[];

  if (dto.farmId) {
    // Verify user owns this farm
    const farm = await this.farmService.findOne(dto.farmId);
    if (farm.userId !== userId) {
      throw new ForbiddenException('You do not own this farm');
    }
    devices = await this.deviceService.findAll(dto.farmId);
  } else if (dto.deviceIds?.length) {
    // Verify user owns all devices (via farm ownership)
    devices = await Promise.all(
      dto.deviceIds.map(id => this.deviceService.findOne(id)),
    );
    for (const device of devices) {
      if (!device.farm || device.farm.userId !== userId) {
        throw new ForbiddenException(`Device ${device.id} not owned by you`);
      }
    }
  } else {
    throw new BadRequestException('Provide deviceIds or farmId');
  }

  // Delegate to existing deploy logic
  return this.deploy(firmwareId, dto);
}
```

### 3. Inject FirmwareService into DeviceGateway

Since `DeviceGateway` already imports from `DeviceModule`, and `FirmwareModule` imports `DeviceModule`, we need to avoid circular dependency.

**Solution:** Use `EventEmitter2` to decouple:

```typescript
// In DeviceGateway — emit event
this.eventEmitter.emit('firmware.update.requested', {
  firmwareId: data.firmwareId,
  deviceIds: data.deviceIds,
  farmId: data.farmId,
  userId,
  socketId: client.id,
});

// In FirmwareService — listen to event
@OnEvent('firmware.update.requested')
async handleMobileUpdateRequest(data: {
  firmwareId: string;
  deviceIds?: string[];
  farmId?: string;
  userId: string;
  socketId: string;
}) {
  try {
    const result = await this.deployForUser(data.firmwareId, data, data.userId);

    // Send ack back to requesting client
    this.deviceGateway.server.to(data.socketId).emit('firmwareUpdateAck', result);
  } catch (error) {
    this.deviceGateway.server.to(data.socketId).emit('firmwareUpdateError', {
      message: error.message,
    });
  }
}
```

### 4. FirmwareModule dependency setup

```typescript
// firmware.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([Firmware, FirmwareUpdateLog]),
    DeviceModule,    // for DeviceService, SyncService, DeviceGateway
    FarmModule,      // for FarmService (ownership check) — forwardRef if circular
  ],
  ...
})
```

If circular dependency with `DeviceModule`:
```typescript
imports: [forwardRef(() => DeviceModule)]
```

## WebSocket Events Summary

| Direction | Event | Payload | When |
|-----------|-------|---------|------|
| Server→Client | `firmwarePublished` | `{id, version, hardwareModel, releaseNotes}` | Admin publishes firmware |
| Client→Server | `requestFirmwareUpdate` | `{firmwareId, deviceIds?, farmId?}` | User taps "Update" |
| Server→Client | `firmwareUpdateAck` | `{firmwareId, version, totalDevices, results}` | Deploy initiated |
| Server→Client | `firmwareUpdateError` | `{message}` | Deploy failed (auth, validation) |
| Server→Client | `deviceStatus` | `{type: 'firmwareDeploying', ...}` | Per-device progress (Phase 5) |
| Server→Client | `deviceStatus` | `{type: 'firmwareUpdateStatus', ...}` | Per-device result (Phase 6) |

## Security Considerations

- **Ownership check mandatory** — user can only update devices belonging to their farms
- `client.data.userId` set during WebSocket JWT handshake (already validated)
- If user sends invalid `deviceIds` → individual `ForbiddenException` per device
- If user sends invalid `farmId` → single `ForbiddenException`

## Todo

- [ ] Add `@SubscribeMessage('requestFirmwareUpdate')` in `DeviceGateway`
- [ ] Use `EventEmitter2` to emit `firmware.update.requested`
- [ ] Add `@OnEvent('firmware.update.requested')` listener in `FirmwareService`
- [ ] Implement `deployForUser()` with ownership validation
- [ ] Import `FarmModule` (or `FarmService`) into `FirmwareModule`
- [ ] Handle circular dependency with `forwardRef` if needed
- [ ] Send `firmwareUpdateAck` / `firmwareUpdateError` back to requesting client
- [ ] Run `yarn build` to verify
- [ ] Test: connect via Socket.IO → emit `requestFirmwareUpdate` → verify deploy

## Success Criteria

- Mobile receives `firmwarePublished` → emits `requestFirmwareUpdate` → gets `firmwareUpdateAck`
- Ownership validated: user can only update their own farm's devices
- Non-owner gets `firmwareUpdateError` with clear message
- Devices receive `OTA_UPDATE` MQTT command (reuses Phase 5 logic)
- Real-time status updates flow back to mobile via device rooms (Phase 6)
