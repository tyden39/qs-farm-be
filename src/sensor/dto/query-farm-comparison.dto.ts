import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType } from '../enums/sensor-type.enum';

export class QueryFarmComparisonDto {
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
}
