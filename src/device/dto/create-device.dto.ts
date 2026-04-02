import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ControlMode } from 'src/shared/enums/control-mode.enum';

export class CreateDeviceDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly image?: string;

  @IsString()
  readonly imei: string;

  @IsOptional()
  @IsString()
  readonly serial?: string;

  @IsOptional()
  @IsString()
  readonly hardwareVersion?: string;

  @IsUUID()
  readonly farmId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  readonly zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  readonly latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  readonly longitude?: number;

  @ApiPropertyOptional({ enum: IrrigationMode })
  @IsOptional()
  @IsEnum(IrrigationMode)
  readonly irrigationMode?: IrrigationMode;

  @ApiPropertyOptional({ enum: ControlMode })
  @IsOptional()
  @IsEnum(ControlMode)
  readonly controlMode?: ControlMode;

  @IsOptional()
  @IsNumber()
  readonly operatingLifeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly pumpEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly hasFertilizer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly fertilizerEnabled?: boolean;
}
