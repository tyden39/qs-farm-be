import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

import { Farm } from 'src/farm/entities/farm.entity';
import { DeviceToken } from './entities/device-token.entity';

export interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

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

    const serviceAccount = JSON.parse(
      fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    this.initialized = true;
    this.logger.log('Firebase Admin SDK initialized');
  }

  async sendToFarmOwner(
    farmId: string,
    notification: FcmNotification,
  ): Promise<void> {
    const tokens = await this.deviceTokenRepo
      .createQueryBuilder('dt')
      .innerJoin(Farm, 'f', 'f.userId = dt.userId')
      .where('f.id = :farmId', { farmId })
      .getMany();
    if (!tokens.length) return;
    await this.sendToTokens(tokens, notification);
  }

  private async sendToTokens(
    tokens: DeviceToken[],
    notification: FcmNotification,
  ): Promise<void> {
    if (!this.initialized) return;

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

      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (
            resp.error?.code ===
              'messaging/registration-token-not-registered' ||
            resp.error?.code === 'messaging/invalid-registration-token'
          ) {
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

      this.logger.debug(
        `FCM sent: ${response.successCount} ok, ${response.failureCount} failed`,
      );
    } catch (error) {
      this.logger.error('FCM send failed:', error.message);
    }
  }
}
