import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CoffeePriceService } from './coffee-price.service';
import { QueryCoffeePriceDto } from './dto/query-coffee-price.dto';

@ApiTags('Coffee Price')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coffee-price')
export class CoffeePriceController {
  constructor(private readonly coffeePriceService: CoffeePriceService) {}

  // List prices with optional filters: market, from, to, limit
  @Get()
  findAll(@Query() query: QueryCoffeePriceDto) {
    return this.coffeePriceService.findAll(query);
  }

  // Returns all markets from the most recent scrape date
  @Get('latest')
  findLatest() {
    return this.coffeePriceService.findLatest();
  }

  // Manually trigger a scrape (useful for testing or backfilling)
  @Post('scrape')
  @HttpCode(200)
  async triggerScrape() {
    await this.coffeePriceService.scrapeAndStore();
    return { message: 'Scrape completed' };
  }
}
