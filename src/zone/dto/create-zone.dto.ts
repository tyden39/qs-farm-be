import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ControlMode } from 'src/shared/enums/control-mode.enum';
import { CoordinateDto } from './coordinate.dto';

export class CreateZoneDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty()
  @IsUUID()
  farmId: string;

  @ApiPropertyOptional({ type: [CoordinateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  coordinates?: CoordinateDto[];

  @ApiPropertyOptional({ enum: IrrigationMode })
  @IsOptional()
  @IsEnum(IrrigationMode)
  irrigationMode?: IrrigationMode;

  @ApiPropertyOptional({ enum: ControlMode })
  @IsOptional()
  @IsEnum(ControlMode)
  controlMode?: ControlMode;
}
