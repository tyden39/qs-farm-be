import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType } from '../enums/sensor-type.enum';
import { TimeBucket } from '../enums/time-bucket.enum';

export class QuerySensorStatsDto {
  @ApiProperty({ enum: SensorType })
  @IsEnum(SensorType)
  sensorType: SensorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: TimeBucket })
  @IsOptional()
  @IsEnum(TimeBucket)
  bucket?: TimeBucket;
}
