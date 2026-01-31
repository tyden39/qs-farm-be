import { IsBoolean, IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'johndoe' })
  @IsString()
  readonly username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  readonly password: string;

  @ApiProperty({ example: 'johndoe@example.com' })
  @IsEmail()
  readonly email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  readonly phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  readonly avatar?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  readonly is_admin?: boolean;
}
