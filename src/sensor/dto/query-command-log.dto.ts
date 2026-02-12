import { IsEnum, IsOptional, IsDateString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommandSource } from '../entities/command-log.entity';

export class QueryCommandLogDto {
  @ApiPropertyOptional({ enum: CommandSource })
  @IsOptional()
  @IsEnum(CommandSource)
  source?: CommandSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: '50' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
