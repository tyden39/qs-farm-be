import { IsOptional, IsUUID, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FirmwareTargetType } from './upload-firmware.dto';

export class CheckUpdateQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ required: false, example: '1.0.0' })
  @IsOptional()
  @IsString()
  currentVersion?: string;

  @ApiProperty({ required: false, example: 'esp32' })
  @IsOptional()
  @IsString()
  hardwareModel?: string;

  @ApiProperty({ required: false, enum: ['device', 'gateway'], default: 'device' })
  @IsOptional()
  @IsIn(['device', 'gateway'])
  targetType?: FirmwareTargetType;
}
