import { IsEnum, IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ThresholdLevel } from '../enums/threshold-level.enum';

export class CreateSensorThresholdDto {
  @ApiProperty({ enum: ThresholdLevel })
  @IsEnum(ThresholdLevel)
  level: ThresholdLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxThreshold?: number;

  @ApiProperty()
  @IsString()
  action: string;
}
