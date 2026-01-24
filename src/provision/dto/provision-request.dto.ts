import { IsString, IsOptional } from 'class-validator';

export class ProvisionRequestDto {
  @IsString()
  serial: string;

  @IsOptional()
  @IsString()
  hw?: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  @IsOptional()
  @IsString()
  sig?: string;
}
