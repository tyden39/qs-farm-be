# Phase 2: FCM Service

## Overview
- **Priority:** High
- **Status:** Complete
- **Effort:** 1.5h

Core service: initialize Firebase Admin SDK, send push notifications to user's registered devices. Handle token invalidation on FCM errors.

## Key Insights
- Firebase Admin SDK initialized once via service account JSON
- Service account path from env var `FIREBASE_SERVICE_ACCOUNT_PATH`
- FCM payload max 4KB — send lightweight: title, body, type, entityId
- Handle `messaging/registration-token-not-registered` error → delete stale token
- Use `sendEachForMulticast` for batch sending to multiple tokens

## FCM Token Lifecycle & Edge Cases

**Token invalidation — khi nào Firebase reject token:**
- User **uninstall app** → Google detect device không còn app → token invalid
- User **reinstall app** → Firebase tạo token mới, token cũ invalid
- User **clear app data** (Settings → Clear Data) → token invalid
- **Token quá lâu không dùng** → Firebase tự expire (~270 ngày)
- **Firebase SDK tự refresh** (hiếm) → token cũ invalid, token mới qua `onTokenRefresh`

**Logout mất mạng:**
- User logout → app gọi `DELETE /unregister-token` nhưng fail (mất mạng) → token cũ vẫn trong DB
- **Không cần xử lý đặc biệt:** khi user mới login trên cùng device → `POST /register-token` upsert → `userId` được update sang user mới → user cũ tự mất token đó
- Worst case: giữa lúc logout fail và login mới, user cũ nhận thêm vài notification. Chấp nhận được.

**Uninstall app (không có cơ hội gọi unregister):**
- Token trở thành stale trong DB
- Lần gửi FCM tiếp theo → Firebase trả `registration-token-not-registered` → **reactive cleanup xóa token**
- Không cần scheduled cleanup job (YAGNI — reactive đủ rồi)

## Files to Create
- `src/notification/fcm.service.ts`

## Implementation Steps

### 1. Create FcmService
```typescript
// src/notification/fcm.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';

import { DeviceToken } from './entities/device-token.entity';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  onModuleInit() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set — FCM disabled');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    this.logger.log('Firebase Admin SDK initialized');
  }

  // Send notification to all devices of a user
  async sendToUser(userId: string, notification: FcmNotification): Promise<void> {
    const tokens = await this.deviceTokenRepo.find({ where: { userId } });
    if (!tokens.length) return;
    await this.sendToTokens(tokens, notification);
  }

  // Send notification to device owner (lookup via deviceId → farm → user)
  async sendToDevice(deviceId: string, farmId: string, notification: FcmNotification): Promise<void> {
    // farmId → farm.userId → user's tokens
    // Query tokens via farm's userId
    const tokens = await this.deviceTokenRepo
      .createQueryBuilder('dt')
      .innerJoin('farm', 'f', 'f.userId = dt.userId')
      .where('f.id = :farmId', { farmId })
      .getMany();
    if (!tokens.length) return;
    await this.sendToTokens(tokens, notification);
  }

  private async sendToTokens(tokens: DeviceToken[], notification: FcmNotification): Promise<void> {
    if (!admin.apps.length) return; // FCM not initialized

    const tokenStrings = tokens.map((t) => t.token);

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenStrings,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
      });

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (resp.error?.code === 'messaging/registration-token-not-registered' ||
              resp.error?.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(tokenStrings[idx]);
          }
        });
        if (invalidTokens.length) {
          await this.deviceTokenRepo
            .createQueryBuilder()
            .delete()
            .where('token IN (:...tokens)', { tokens: invalidTokens })
            .execute();
          this.logger.log(`Removed ${invalidTokens.length} stale FCM tokens`);
        }
      }

      this.logger.debug(`FCM sent: ${response.successCount} ok, ${response.failureCount} failed`);
    } catch (error) {
      this.logger.error('FCM send failed:', error.message);
    }
  }
}

// Notification payload interface
export interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>; // Must be string values for FCM
}
```

### 2. Key design decisions
- **Graceful degradation:** If `FIREBASE_SERVICE_ACCOUNT_PATH` not set, FCM is disabled (no crash)
- **Token cleanup:** Auto-remove invalid tokens on send failure
- **No exceptions thrown:** FCM failures logged but don't break caller flow (alerts/schedules still work)
- **`sendToDevice`:** Queries tokens via farm relationship (device → farm → user → tokens)

## Todo
- [x] Create `src/notification/fcm.service.ts`
- [x] Add `FIREBASE_SERVICE_ACCOUNT_PATH` to `.env.example`
- [x] Add Firebase service account JSON patterns to `.gitignore`
- [x] Run `yarn build` to verify compilation

## As-Built Deviations
- `require()` replaced with `fs.readFileSync` for service account loading (code review fix)
- `sendToDevice` renamed to `sendToFarmOwner`, `deviceId` param removed
- Entity class `Farm` used in join (not raw table string)
- `sendToUser()` removed (YAGNI)
- FCM alert body has fallback when `reason` is undefined

## Success Criteria
- Service initializes Firebase on module init (or warns if env var missing)
- `sendToUser()` sends to all user's FCM tokens
- `sendToDevice()` resolves farm owner and sends
- Stale tokens auto-cleaned on send errors

## Risk Assessment
- Firebase service account key must NOT be committed to git → add to `.gitignore`
- `require()` for JSON file is acceptable for service account loading
