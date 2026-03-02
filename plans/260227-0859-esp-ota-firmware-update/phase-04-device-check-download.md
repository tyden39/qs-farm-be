# Phase 4: Device Check & Download Endpoints

**Priority:** High | **Effort:** Medium | **Status:** Pending

## Overview

ESP device calls HTTP endpoints to check for available firmware updates and download the binary. No JWT auth required for these endpoints — device identifies itself via query params.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 2: Upload & CRUD](./phase-02-upload-crud-endpoints.md)
- [Research: ESP OTA Patterns](../reports/researcher-260227-0859-esp-ota-patterns.md)

## Architecture

```
ESP Device
  │
  ├─ GET /firmware/check?deviceId=xxx&currentVersion=1.0.0
  │   Response: { updateAvailable, version, downloadUrl, checksum, size }
  │
  └─ GET /firmware/download/:id
      Response: Binary stream with Content-MD5 header
```

## Related Code Files

**Create:**
- `src/firmware/dto/check-update-query.dto.ts`

**Modify:**
- `src/firmware/firmware.controller.ts` — add check + download endpoints
- `src/firmware/firmware.service.ts` — add check + download logic

## Implementation Steps

### 1. Create `check-update-query.dto.ts`

```typescript
export class CheckUpdateQueryDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @IsString()
  currentVersion?: string;

  @IsOptional()
  @IsString()
  hardwareModel?: string;  // "esp32", etc.
}
```

### 2. Add check endpoint (no auth)

```typescript
@Get('check')
async checkForUpdate(@Query() query: CheckUpdateQueryDto) {
  return this.firmwareService.checkForUpdate(query);
}
```

**Service logic:**
```typescript
async checkForUpdate(query: CheckUpdateQueryDto) {
  // Determine hardware model from device or query
  let hardwareModel = query.hardwareModel;

  if (query.deviceId) {
    const device = await this.deviceService.findOne(query.deviceId);
    hardwareModel = hardwareModel || device.hardwareVersion;
  }

  // Find latest published firmware for this model
  const latest = await this.firmwareRepository.findOne({
    where: { hardwareModel, isPublished: true },
    order: { createdAt: 'DESC' },
  });

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
```

### 3. Add download endpoint (no auth, streams binary)

```typescript
@Get('download/:id')
async download(@Param('id') id: string, @Res() res: Response) {
  const firmware = await this.firmwareService.findOne(id);

  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': firmware.fileSize.toString(),
    'Content-MD5': firmware.checksum,
    'Content-Disposition': `attachment; filename="firmware-${firmware.version}.bin"`,
  });

  const stream = createReadStream(firmware.filePath);
  stream.pipe(res);
}
```

### 4. Version comparison

Simple semver comparison — compare latest published version against device's current version. Since we use `createdAt: DESC` ordering, the most recently uploaded published firmware is considered "latest".

If more sophisticated version comparison needed later, use `semver` package. For now, simple `!==` check is sufficient (device always gets latest published).

## Security Considerations

- **No JWT required** for check/download — device may not have JWT capability
- **Rate limiting** recommended on check endpoint to prevent abuse
- Download endpoint serves binary — no sensitive data exposed
- Device validates checksum after download before flashing

## Todo

- [ ] Create `src/firmware/dto/check-update-query.dto.ts`
- [ ] Add `GET /firmware/check` endpoint (no auth guard)
- [ ] Add `GET /firmware/download/:id` endpoint (no auth guard, stream binary)
- [ ] Implement `checkForUpdate()` in service
- [ ] Run `yarn build` to verify
- [ ] Test with curl: `curl /api/firmware/check?hardwareModel=esp32&currentVersion=0.0.0`
- [ ] Test binary download: `curl -o test.bin /api/firmware/download/{id}`

## Success Criteria

- Device with older version gets `updateAvailable: true` + download URL
- Device with current version gets `updateAvailable: false`
- Download streams correct binary with Content-MD5 header
- No auth required for check/download endpoints
