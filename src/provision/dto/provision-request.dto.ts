import { IsString, IsOptional } from 'class-validator';

export class ProvisionRequestDto {
  @IsString()
  serial: string;

  @IsOptional()
  @IsString()
  hw?: string;

  @IsString()
  nonce: string; // Required for response topic

  @IsOptional()
  @IsString()
  sig?: string;
}
