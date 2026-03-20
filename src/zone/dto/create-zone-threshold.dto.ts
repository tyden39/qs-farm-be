import { IsEnum, IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';

export class CreateZoneThresholdDto {
  @ApiProperty({ enum: ThresholdLevel })
  @IsEnum(ThresholdLevel)
  level: ThresholdLevel;

  @ApiPropertyOptional({ enum: IrrigationMode })
  @IsOptional()
  @IsEnum(IrrigationMode)
  irrigationMode?: IrrigationMode;

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
