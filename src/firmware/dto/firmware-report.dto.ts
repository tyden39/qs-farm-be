import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FirmwareUpdateStatus } from '../entities/firmware-update-log.entity';

export class FirmwareReportDto {
  // Exactly one of deviceId / gatewayId must be provided.
  // ValidateIf triggers UUID check only when the other field is absent.
  @ApiProperty({ required: false, description: 'Required if gatewayId absent' })
  @ValidateIf((o) => !o.gatewayId)
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Required if deviceId absent' })
  @ValidateIf((o) => !o.deviceId)
  @IsUUID()
  gatewayId?: string;

  @ApiProperty({ example: '1.3.0' })
  @IsString()
  version: string;

  @ApiProperty({ enum: FirmwareUpdateStatus })
  @IsEnum(FirmwareUpdateStatus)
  status: FirmwareUpdateStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({ required: false, description: 'Duration in ms' })
  @IsOptional()
  @IsInt()
  duration?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  previousVersion?: string;
}
