import { IsUUID, IsString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FirmwareUpdateStatus } from '../entities/firmware-update-log.entity';

export class FirmwareReportDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;

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
