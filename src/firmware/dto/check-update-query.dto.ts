import { IsOptional, IsUUID, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
