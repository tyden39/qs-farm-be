import { IsOptional, IsDateString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PumpReportQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Response format',
    enum: ['json', 'excel'],
    default: 'json',
  })
  @IsOptional()
  @IsIn(['json', 'excel'])
  format?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based). Applies to JSON format only; ignored for Excel.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description:
      'Page size / max sessions to return. Default 100 (JSON) or 5000 (Excel). Hard cap 50000.',
    minimum: 1,
    maximum: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50000)
  limit?: number;
}
