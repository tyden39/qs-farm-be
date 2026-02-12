import { IsEnum, IsOptional, IsDateString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType } from '../enums/sensor-type.enum';

export class QuerySensorDataDto {
  @ApiPropertyOptional({ enum: SensorType })
  @IsOptional()
  @IsEnum(SensorType)
  sensorType?: SensorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: '100' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
