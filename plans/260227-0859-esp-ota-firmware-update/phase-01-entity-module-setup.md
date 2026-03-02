# Phase 1: Entity & Module Setup

**Priority:** High | **Effort:** Small | **Status:** Pending

## Overview

Create the `FirmwareModule` with TypeORM entities, register in `AppModule`.

## Context Links

- [Plan Overview](./plan.md)
- [Research Report](../reports/researcher-260227-0859-esp-ota-patterns.md)
- Existing patterns: `src/device/entities/device.entity.ts`, `src/sensor/entities/sensor-data.entity.ts`

## Architecture

```
src/firmware/
├── firmware.module.ts
├── firmware.controller.ts
├── firmware.service.ts
├── entities/
│   ├── firmware.entity.ts
│   └── firmware-update-log.entity.ts
└── dto/
    ├── upload-firmware.dto.ts
    ├── update-firmware.dto.ts
    ├── check-update-query.dto.ts
    └── firmware-report.dto.ts
```

## Related Code Files

**Create:**
- `src/firmware/firmware.module.ts`
- `src/firmware/entities/firmware.entity.ts`
- `src/firmware/entities/firmware-update-log.entity.ts`

**Modify:**
- `src/app.module.ts` — import `FirmwareModule`
- `src/device/entities/device.entity.ts` — add `firmwareVersion` column (nullable, VARCHAR(20))

## Implementation Steps

### 1. Create `firmware.entity.ts`

```typescript
@Entity()
export class Firmware {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  version: string;

  @Column({ length: 50 })
  hardwareModel: string;  // "esp32", "esp32-s3", etc.

  @Column({ length: 255 })
  fileName: string;

  @Column({ length: 255 })
  filePath: string;  // disk path: ./files/firmware/xxx.bin

  @Column('int')
  fileSize: number;

  @Column({ length: 64 })
  checksum: string;  // MD5 hex

  @Column({ type: 'text', nullable: true })
  releaseNotes: string;

  @Column({ default: false })
  isPublished: boolean;

  @Column({ nullable: true })
  publishedAt: Date;

  @Column('uuid')
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 2. Create `firmware-update-log.entity.ts`

```typescript
export enum FirmwareUpdateStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  SUCCESS = 'success',
  FAILED = 'failed',
  ROLLBACK = 'rollback',
}

@Entity()
export class FirmwareUpdateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  firmwareId: string;

  @ManyToOne(() => Firmware)
  @JoinColumn({ name: 'firmwareId' })
  firmware: Firmware;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ length: 20, nullable: true })
  previousVersion: string;

  @Column({ type: 'enum', enum: FirmwareUpdateStatus, default: FirmwareUpdateStatus.PENDING })
  status: FirmwareUpdateStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'int', nullable: true })
  duration: number;  // ms

  @Column({ nullable: true })
  reportedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 3. Create `firmware.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Firmware, FirmwareUpdateLog]),
    DeviceModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './files/firmware',
        filename: (req, file, cb) => {
          const ext = file.originalname.split('.').pop()?.toLowerCase();
          cb(null, `${randomStringGenerator()}.${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.bin$/i)) {
          return cb(new UnprocessableEntityException('Only .bin files allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 4 * 1024 * 1024 },  // 4MB max for ESP firmware
    }),
  ],
  controllers: [FirmwareController],
  providers: [FirmwareService],
  exports: [FirmwareService],
})
export class FirmwareModule {}
```

### 4. Add `firmwareVersion` to Device entity

```typescript
// In device.entity.ts, add:
@Column({ length: 20, nullable: true })
firmwareVersion: string;
```

### 5. Register in AppModule

```typescript
// In app.module.ts imports array, add:
FirmwareModule,
```

### 6. Create firmware upload directory

```bash
mkdir -p ./files/firmware
```

## Todo

- [ ] Create `src/firmware/entities/firmware.entity.ts`
- [ ] Create `src/firmware/entities/firmware-update-log.entity.ts`
- [ ] Create `src/firmware/firmware.module.ts` (empty controller/service stubs)
- [ ] Add `firmwareVersion` column to `Device` entity
- [ ] Register `FirmwareModule` in `AppModule`
- [ ] Ensure `./files/firmware` directory exists (add to .gitkeep)
- [ ] Run `yarn build` to verify compilation

## Success Criteria

- `yarn build` passes with no errors
- Entities auto-sync to PostgreSQL on server start
- `firmware` and `firmware_update_log` tables created in DB
