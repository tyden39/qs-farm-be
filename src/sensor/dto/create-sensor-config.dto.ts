import { IsEnum, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType } from '../enums/sensor-type.enum';
import { SensorMode } from '../enums/sensor-mode.enum';

export class CreateSensorConfigDto {
  @ApiProperty({ enum: SensorType })
  @IsEnum(SensorType)
  sensorType: SensorType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: SensorMode, default: SensorMode.AUTO })
  @IsOptional()
  @IsEnum(SensorMode)
  mode?: SensorMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;
}
