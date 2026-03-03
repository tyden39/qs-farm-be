import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { Platform } from '../enums/platform.enum';

export class RegisterTokenDto {
  @ApiProperty({ example: 'fcm-token-string-from-flutter' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: Platform, example: Platform.ANDROID })
  @IsEnum(Platform)
  platform: Platform;
}
