import { IsEnum, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ThresholdLevel } from '../enums/threshold-level.enum';
import { ThresholdType } from '../enums/threshold-type.enum';

export class CreateSensorThresholdDto {
  @ApiProperty({ enum: ThresholdLevel })
  @IsEnum(ThresholdLevel)
  level: ThresholdLevel;

  @ApiProperty({ enum: ThresholdType })
  @IsEnum(ThresholdType)
  type: ThresholdType;

  @ApiProperty()
  @IsNumber()
  threshold: number;

  @ApiProperty()
  @IsString()
  action: string;
}
