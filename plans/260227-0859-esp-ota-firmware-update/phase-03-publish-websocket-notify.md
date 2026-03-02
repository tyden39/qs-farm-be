# Phase 3: Publish & WebSocket Notification

**Priority:** High | **Effort:** Small | **Status:** Pending

## Overview

When admin marks a firmware version as "published", broadcast notification to all connected mobile clients via WebSocket. Mobile app can then prompt users about the new version.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 2: Upload & CRUD](./phase-02-upload-crud-endpoints.md)
- Existing pattern: `src/device/websocket/device.gateway.ts` broadcast methods

## Architecture

```
Admin PATCH /firmware/:id { isPublished: true }
  │
  ├─ FirmwareService.update() → sets isPublished=true, publishedAt=now
  │
  ├─ EventEmitter.emit('firmware.published', firmware)
  │
  └─ DeviceGateway.broadcast('firmwarePublished', {
       id, version, hardwareModel, releaseNotes, publishedAt
     })
       │
       └─ All connected WebSocket clients receive notification
```

## Related Code Files

**Modify:**
- `src/firmware/firmware.service.ts` — emit event on publish
- `src/device/websocket/device.gateway.ts` — add broadcast helper (or reuse existing `broadcast()`)

## Implementation Steps

### 1. Add publish logic in `firmware.service.ts`

In the `update()` method, when `isPublished` changes to `true`:

```typescript
async update(id: string, dto: UpdateFirmwareDto) {
  const firmware = await this.findOne(id);

  if (dto.isPublished && !firmware.isPublished) {
    firmware.isPublished = true;
    firmware.publishedAt = new Date();
    const saved = await this.firmwareRepository.save(firmware);

    // Notify all connected mobile clients
    this.eventEmitter.emit('firmware.published', saved);
    return saved;
  }

  Object.assign(firmware, dto);
  return this.firmwareRepository.save(firmware);
}
```

### 2. Listen to event and broadcast via WebSocket

In `SyncService` (or directly in `FirmwareService` if injecting `DeviceGateway`):

```typescript
// Option A: Direct broadcast from FirmwareService (simpler)
this.deviceGateway.broadcast('firmwarePublished', {
  id: firmware.id,
  version: firmware.version,
  hardwareModel: firmware.hardwareModel,
  releaseNotes: firmware.releaseNotes,
  publishedAt: firmware.publishedAt,
});
```

**Decision:** Use direct injection of `DeviceGateway` into `FirmwareModule` (simpler, avoids extra event listener). Import `DeviceModule` in `FirmwareModule`.

### 3. Add dedicated publish endpoint (optional convenience)

```typescript
@Post(':id/publish')
@UseGuards(JwtAuthGuard)
async publish(@Param('id') id: string) {
  return this.firmwareService.publish(id);
}

@Post(':id/unpublish')
@UseGuards(JwtAuthGuard)
async unpublish(@Param('id') id: string) {
  return this.firmwareService.unpublish(id);
}
```

## WebSocket Event Format

**Event:** `firmwarePublished`
**Broadcast to:** All connected clients
**Payload:**
```json
{
  "id": "uuid",
  "version": "1.3.0",
  "hardwareModel": "esp32",
  "releaseNotes": "Bug fixes",
  "publishedAt": "2026-02-27T09:00:00Z"
}
```

## Todo

- [ ] Add publish/unpublish logic in `FirmwareService`
- [ ] Inject `DeviceGateway` into `FirmwareModule`
- [ ] Broadcast `firmwarePublished` event on publish
- [ ] Add `POST /firmware/:id/publish` convenience endpoint
- [ ] Run `yarn build` to verify

## Success Criteria

- Publishing firmware → all WebSocket clients receive `firmwarePublished` event
- Unpublishing → no broadcast (silent)
- Already-published firmware → no duplicate broadcast
