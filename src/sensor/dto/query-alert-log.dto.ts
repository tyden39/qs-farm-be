import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsBooleanString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType } from '../enums/sensor-type.enum';
import { ThresholdLevel } from '../enums/threshold-level.enum';

export class QueryAlertLogDto {
  @ApiPropertyOptional({ enum: SensorType })
  @IsOptional()
  @IsEnum(SensorType)
  sensorType?: SensorType;

  @ApiPropertyOptional({ enum: ThresholdLevel })
  @IsOptional()
  @IsEnum(ThresholdLevel)
  level?: ThresholdLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  acknowledged?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
