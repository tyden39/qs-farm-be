import { IsString, IsOptional, IsUUID, IsNumber } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  readonly operatingLifeHours?: number;
}
