import { IsString, IsOptional, IsUUID } from 'class-validator';

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
}
