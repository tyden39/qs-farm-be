import { IsEnum, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { SensorMode } from 'src/sensor/enums/sensor-mode.enum';

export class CreateZoneSensorConfigDto {
  @ApiProperty({ enum: SensorType })
  @IsEnum(SensorType)
  sensorType: SensorType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: SensorMode })
  @IsOptional()
  @IsEnum(SensorMode)
  mode?: SensorMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;
}
