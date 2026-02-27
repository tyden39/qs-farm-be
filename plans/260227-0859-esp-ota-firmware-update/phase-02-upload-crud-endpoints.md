# Phase 2: Upload & CRUD Endpoints

**Priority:** High | **Effort:** Medium | **Status:** Pending

## Overview

Implement firmware upload (multipart `.bin` file), list versions, and delete endpoints. Admin-only access via JWT.

## Context Links

- [Plan Overview](./plan.md)
- [Phase 1: Entity Setup](./phase-01-entity-module-setup.md)
- Existing pattern: `src/files/files.controller.ts`, `src/device/device.controller.ts`

## Related Code Files

**Create:**
- `src/firmware/dto/upload-firmware.dto.ts`
- `src/firmware/dto/update-firmware.dto.ts`
- `src/firmware/firmware.service.ts`
- `src/firmware/firmware.controller.ts`

**Modify:**
- `src/firmware/firmware.module.ts` — wire dependencies

## Implementation Steps

### 1. Create `upload-firmware.dto.ts`

```typescript
export class UploadFirmwareDto {
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'Version must be semver (e.g. 1.0.0)' })
  version: string;

  @IsString()
  hardwareModel: string;  // "esp32", "esp32-s3"

  @IsOptional()
  @IsString()
  releaseNotes?: string;
}
```

### 2. Create `update-firmware.dto.ts`

```typescript
export class UpdateFirmwareDto {
  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
```

### 3. Implement `firmware.service.ts`

Key methods:
- `upload(file, dto, userId)` — Save file to disk, compute MD5, create entity
- `findAll(hardwareModel?)` — List all versions, optionally filtered
- `findOne(id)` — Get firmware by ID
- `findLatestPublished(hardwareModel)` — Get latest published version
- `update(id, dto)` — Update metadata (releaseNotes, publish status)
- `remove(id)` — Delete firmware record + file from disk

**MD5 checksum computation:**
```typescript
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const fileBuffer = readFileSync(filePath);
const checksum = createHash('md5').update(fileBuffer).digest('hex');
```

### 4. Implement `firmware.controller.ts`

```
@ApiTags('Firmware')
@ApiBearerAuth()
@Controller('firmware')

POST   /firmware/upload         — @UseGuards(JwtAuthGuard) + FileInterceptor('file')
GET    /firmware                — @UseGuards(JwtAuthGuard) — list all versions
GET    /firmware/:id            — @UseGuards(JwtAuthGuard) — get single version
PATCH  /firmware/:id            — @UseGuards(JwtAuthGuard) — update metadata
DELETE /firmware/:id            — @UseGuards(JwtAuthGuard) — delete version
```

**Upload endpoint pattern** (follows existing device upload pattern):
```typescript
@Post('upload')
@UseGuards(JwtAuthGuard)
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
async upload(
  @UploadedFile() file: Express.Multer.File,
  @Body() dto: UploadFirmwareDto,
  @CurrentUser() user: User,
) {
  return this.firmwareService.upload(file, dto, user.id);
}
```

### 5. Swagger documentation

Add `@ApiProperty()` decorators to DTOs with examples:
- version: `"1.0.0"`
- hardwareModel: `"esp32"`
- releaseNotes: `"Bug fixes and improvements"`

## Todo

- [ ] Create `src/firmware/dto/upload-firmware.dto.ts`
- [ ] Create `src/firmware/dto/update-firmware.dto.ts`
- [ ] Implement `firmware.service.ts` with upload, CRUD, MD5 checksum
- [ ] Implement `firmware.controller.ts` with all endpoints
- [ ] Add Swagger decorators
- [ ] Run `yarn build` to verify
- [ ] Test upload endpoint manually with curl/Postman

## Success Criteria

- Upload `.bin` file → stored in `./files/firmware/`, entity created with MD5 checksum
- List/get/update/delete endpoints work correctly
- Only JWT-authenticated users can access
- Duplicate version returns 409 Conflict
- Non-.bin file returns 422 Unprocessable Entity
