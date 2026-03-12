import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumberString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoffeeMarket } from '../enums/coffee-market.enum';

export class QueryCoffeePriceDto {
  @ApiPropertyOptional({ enum: CoffeeMarket })
  @IsOptional()
  @IsEnum(CoffeeMarket)
  market?: CoffeeMarket;

  @ApiPropertyOptional({ description: 'ISO date, e.g. 2026-03-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, e.g. 2026-03-12' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: '30' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
