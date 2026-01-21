import { IsBoolean, IsString, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  readonly username: string;

  @IsString()
  readonly password: string;

  @IsOptional()
  @IsString()
  readonly avatar?: string;

  @IsOptional()
  @IsBoolean()
  readonly is_admin?: boolean;
}
