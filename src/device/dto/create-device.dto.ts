import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly image?: string;

  @IsString()
  readonly imei: string;

  @IsUUID()
  readonly farmId: string;
}
