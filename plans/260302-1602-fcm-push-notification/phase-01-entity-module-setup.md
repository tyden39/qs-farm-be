# Phase 1: Entity + Module Setup

## Overview
- **Priority:** High
- **Status:** Complete
- **Effort:** 1h

Install `firebase-admin`, create `DeviceToken` entity, `NotificationModule`, and register in `AppModule`.

## Key Insights
- Follow existing entity patterns: UUID PK, `@CreateDateColumn`, `@UpdateDateColumn`
- Unique constraint on `token` column (one FCM token = one device)
- User can have multiple tokens (multiple phones/tablets)
- Platform enum for iOS/Android distinction

## Files to Create
- `src/notification/entities/device-token.entity.ts`
- `src/notification/enums/platform.enum.ts`
- `src/notification/notification.module.ts`

## Files to Modify
- `src/app.module.ts` — import `NotificationModule`
- `package.json` — add `firebase-admin`

## Implementation Steps

### 1. Install firebase-admin
```bash
yarn add firebase-admin
```

### 2. Create Platform enum
```typescript
// src/notification/enums/platform.enum.ts
export enum Platform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}
```

### 3. Create DeviceToken entity
```typescript
// src/notification/entities/device-token.entity.ts
@Entity('device_token')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', unique: true })
  token: string;

  @Column({ type: 'enum', enum: Platform })
  platform: Platform;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 4. Create NotificationModule
```typescript
// src/notification/notification.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken]),
  ],
  controllers: [NotificationController],
  providers: [FcmService],
  exports: [FcmService],
})
export class NotificationModule {}
```

### 5. Register in AppModule
Add `NotificationModule` to imports array in `src/app.module.ts`.

## Todo
- [x] `yarn add firebase-admin`
- [x] Create `src/notification/enums/platform.enum.ts`
- [x] Create `src/notification/entities/device-token.entity.ts`
- [x] Create `src/notification/notification.module.ts` (placeholder — controller + service added in later phases)
- [x] Add `NotificationModule` to `AppModule` imports
- [x] Run `yarn build` to verify compilation

## Success Criteria
- `yarn build` passes
- `device_token` table auto-created by TypeORM synchronize
- `firebase-admin` in dependencies
