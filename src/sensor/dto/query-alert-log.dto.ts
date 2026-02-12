import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsBooleanString,
} from 'class-validator';
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
}
