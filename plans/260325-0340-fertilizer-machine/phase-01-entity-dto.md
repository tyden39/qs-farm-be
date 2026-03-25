# Phase 01 — Entity + DTO

## Context Links
- Device entity: `src/device/entities/device.entity.ts`
- CreateDeviceDto: `src/device/dto/create-device.dto.ts`
- UpdateDeviceDto: `src/device/dto/update-device.dto.ts` (auto-inherits via PartialType)

## Overview
- **Priority:** P1
- **Status:** Completed
- **Description:** Add `hasFertilizer` and `fertilizerEnabled` boolean fields to Device entity and DTO.

## Key Insights
- Device already has `pumpEnabled: boolean` at line 96 — follow exact same pattern
- `UpdateDeviceDto extends PartialType(CreateDeviceDto)` → only need to update `CreateDeviceDto`
- TypeORM `synchronize: true` auto-migrates schema (no manual migration needed)
- Both fields default to `false` — backward compatible, no existing rows affected

## Requirements
- `hasFertilizer: boolean` — device has fertilizer machine physically attached (feature flag)
- `fertilizerEnabled: boolean` — fertilizer machine current ON/OFF state (operational)
- Both optional in DTO (devices without fertilizer machine omit them)
- Swagger documented via `@ApiPropertyOptional()`

## Architecture

```
Device entity
  pumpEnabled: boolean       // existing
  hasFertilizer: boolean     // NEW — feature presence flag (set by admin)
  fertilizerEnabled: boolean // NEW — operational ON/OFF state (synced from MQTT)

Semantic:
  hasFertilizer=false → entire fertilizer feature hidden/skipped
  hasFertilizer=true + fertilizerEnabled=false → machine present but OFF
  hasFertilizer=true + fertilizerEnabled=true → machine ON

Update flows:
  hasFertilizer   → PATCH /devices/:id { hasFertilizer: true }
                    (admin config: "this device has a fertilizer machine")
                    → DeviceService.update() handles automatically via preload()

  fertilizerEnabled → synced from MQTT response FERTILIZER_ON/OFF
                      (Phase 02: handleDeviceResponse in SyncService)
                    + also writable via PATCH /devices/:id { fertilizerEnabled: true }
```

## Related Code Files
- **Modify:** `src/device/entities/device.entity.ts`
- **Modify:** `src/device/dto/create-device.dto.ts`

## Implementation Steps

### Step 1: Update Device Entity

In `src/device/entities/device.entity.ts`, after line 97 (`pumpEnabled: boolean`):

```typescript
@Column({ type: 'boolean', default: false })
hasFertilizer: boolean;

@Column({ type: 'boolean', default: false })
fertilizerEnabled: boolean;
```

### Step 2: Update CreateDeviceDto

In `src/device/dto/create-device.dto.ts`, after the `pumpEnabled` field:

```typescript
@ApiPropertyOptional()
@IsOptional()
@IsBoolean()
readonly hasFertilizer?: boolean;

@ApiPropertyOptional()
@IsOptional()
@IsBoolean()
readonly fertilizerEnabled?: boolean;
```

### Step 3: Verify compile

```bash
yarn build
```

## Todo List

- [x] Add `hasFertilizer` column to Device entity (after `pumpEnabled`)
- [x] Add `fertilizerEnabled` column to Device entity
- [x] Add `hasFertilizer` to `CreateDeviceDto` with `@ApiPropertyOptional` + `@IsOptional` + `@IsBoolean`
- [x] Add `fertilizerEnabled` to `CreateDeviceDto`
- [x] Run `yarn build` to verify no compile errors

## Success Criteria
- `yarn build` passes with no errors
- Both fields appear in Swagger at `/api`
- `UpdateDeviceDto` automatically inherits both fields (no change needed)

## Risk Assessment
- **Low risk:** Pattern identical to existing `pumpEnabled`
- TypeORM sync handles column addition without data loss

## Security Considerations
- Fields are user-configurable via existing device update endpoint (already guarded by `JwtAuthGuard`)
- No additional auth needed

## Next Steps
- Phase 2: Add guard checks in SyncService + ScheduleService
