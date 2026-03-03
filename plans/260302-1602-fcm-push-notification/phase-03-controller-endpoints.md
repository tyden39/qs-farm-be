# Phase 3: Controller + DTOs

## Overview
- **Priority:** High
- **Status:** Complete
- **Effort:** 0.5h

REST endpoints for Flutter app to register/unregister FCM tokens. Protected by `JwtAuthGuard`.

## Files to Create
- `src/notification/dtos/register-token.dto.ts`
- `src/notification/notification.controller.ts`

## Implementation Steps

### 1. Create RegisterTokenDto
```typescript
// src/notification/dtos/register-token.dto.ts
import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '../enums/platform.enum';

export class RegisterTokenDto {
  @ApiProperty({ example: 'fcm-token-string-from-flutter' })
  @IsString()
  token: string;

  @ApiProperty({ enum: Platform, example: Platform.ANDROID })
  @IsEnum(Platform)
  platform: Platform;
}
```

### 2. Create NotificationController
```typescript
// src/notification/notification.controller.ts
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification')
export class NotificationController {
  constructor(
    private readonly fcmService: FcmService,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  @Post('register-token')
  async registerToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterTokenDto,
  ) {
    // Upsert: if token exists, update userId (device may switch accounts)
    const existing = await this.deviceTokenRepo.findOne({ where: { token: dto.token } });
    if (existing) {
      existing.userId = user.id;
      existing.platform = dto.platform;
      return this.deviceTokenRepo.save(existing);
    }
    return this.deviceTokenRepo.save(
      this.deviceTokenRepo.create({
        userId: user.id,
        token: dto.token,
        platform: dto.platform,
      }),
    );
  }

  @Delete('unregister-token')
  async unregisterToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterTokenDto,
  ) {
    await this.deviceTokenRepo.delete({ userId: user.id, token: dto.token });
    return { message: 'Token unregistered' };
  }
}
```

### 3. Key decisions
- **Upsert on register:** Cùng 1 FCM token (cùng device) → login user khác → update `userId`. Giải quyết case logout mất mạng (token chưa bị xóa) — lần login tiếp sẽ tự gán sang user mới
- **Delete on unregister:** Gọi khi logout. Nếu fail (mất mạng) → không sao, upsert lần login sau sẽ cover
- **Flutter side cần:** gọi `POST /register-token` mỗi lần login + listen `onTokenRefresh` để re-register khi Firebase SDK tự refresh token
- **`@CurrentUser()` decorator:** Reuse existing decorator from auth module to get user from JWT

## Todo
- [x] Create `src/notification/dtos/register-token.dto.ts`
- [x] Create `src/notification/notification.controller.ts`
- [x] Update `NotificationModule` — add `NotificationController` to controllers, inject `DeviceToken` repo
- [x] Run `yarn build` to verify

## As-Built Deviations
- `@IsNotEmpty()` added to `token` field in DTO (code review fix)

## Success Criteria
- `POST /api/notification/register-token` saves token with authenticated user
- `DELETE /api/notification/unregister-token` removes token
- Swagger docs show endpoints under "Notifications" tag
- Duplicate token registration updates instead of errors
