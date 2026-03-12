# Phase 3: Scraping Service

## Context

- [Brainstorm Report](../reports/brainstormer-260312-0813-coffee-price-scraping.md) -- scraping strategy, retry logic
- [schedule.service.ts](../../src/schedule/schedule.service.ts) -- cron pattern reference
- Target URL: `https://giacaphe.com/gia-ca-phe-noi-dia/`

## Overview

- **Priority:** P1 (core feature)
- **Status:** complete
- Puppeteer scraping + Cheerio parsing + cron scheduling + CRUD queries

## Key Insights

- Site behind Cloudflare managed challenge -- must use headless browser
- Page contains HTML table with rows per market, columns for price/change
- Once-daily scrape at midnight Vietnam time -- negligible resource impact
- Exact CSS selectors must be determined at implementation time by running Puppeteer locally first

## Architecture

```
@Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  └─> scrapeAndStore()
        ├─> launchBrowser()
        ├─> navigateAndWaitForContent()
        ├─> parseTableWithCheerio()
        ├─> upsertPrices()
        └─> closeBrowser()
```

## Implementation Steps

### 1. Create `src/coffee-price/coffee-price.service.ts`

Split into logical sections. Keep under 200 lines total.

#### Section A: Imports & Constructor

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { CoffeePrice } from './entities/coffee-price.entity';
import { CoffeeMarket, CoffeeMarketLabel } from './enums/coffee-market.enum';
import { QueryCoffeePriceDto } from './dto/query-coffee-price.dto';

@Injectable()
export class CoffeePriceService {
  private readonly logger = new Logger(CoffeePriceService.name);
  private readonly SCRAPE_URL = 'https://giacaphe.com/gia-ca-phe-noi-dia/';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [0, 30000, 60000]; // ms

  constructor(
    @InjectRepository(CoffeePrice)
    private readonly coffeePriceRepo: Repository<CoffeePrice>,
  ) {}
```

#### Section B: Cron Job + Retry Logic

```typescript
  @Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleDailyScrape(): Promise<void> {
    this.logger.log('Starting daily coffee price scrape');
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        if (this.RETRY_DELAYS[attempt] > 0) {
          await this.delay(this.RETRY_DELAYS[attempt]);
        }
        await this.scrapeAndStore();
        this.logger.log('Scrape completed successfully');
        return;
      } catch (error) {
        this.logger.error(`Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }
    this.logger.error('All scrape attempts failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
```

#### Section C: Puppeteer Scraping

```typescript
  async scrapeAndStore(): Promise<void> {
    let browser: puppeteer.Browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.goto(this.SCRAPE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('table', { timeout: 15000 });
      const html = await page.content();
      const prices = this.parseHtml(html);
      await this.upsertPrices(prices);
    } finally {
      if (browser) await browser.close();
    }
  }
```

#### Section D: HTML Parsing with Cheerio

```typescript
  private parseHtml(html: string): Partial<CoffeePrice>[] {
    const $ = cheerio.load(html);
    const results: Partial<CoffeePrice>[] = [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // NOTE: Exact selectors must be determined by inspecting the actual page.
    // The site typically has a table with rows per market.
    // Each row: market name | price | change
    // Adjust selectors during implementation after running Puppeteer locally.

    $('table tbody tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 2) return;

      const marketName = $(cols[0]).text().trim();
      const market = this.matchMarket(marketName);
      if (!market) return;

      const priceText = $(cols[1]).text().trim();
      const changeText = cols.length > 2 ? $(cols[2]).text().trim() : null;

      results.push({
        date: today,
        market,
        marketLabel: CoffeeMarketLabel[market],
        averagePrice: this.parseVietnameseNumber(priceText),
        priceChange: changeText ? this.parseVietnameseNumber(changeText) : null,
        unit: market === CoffeeMarket.USD_VND ? 'VND/USD' : 'VND/kg',
      });
    });

    this.logger.log(`Parsed ${results.length} market prices`);
    return results;
  }
```

#### Section E: Helper Methods

```typescript
  // Map Vietnamese market names to enum values
  private matchMarket(name: string): CoffeeMarket | null {
    const normalized = name.toLowerCase();
    const mapping: Record<string, CoffeeMarket> = {
      'đắk lắk': CoffeeMarket.DAK_LAK,
      'dak lak': CoffeeMarket.DAK_LAK,
      'lâm đồng': CoffeeMarket.LAM_DONG,
      'lam dong': CoffeeMarket.LAM_DONG,
      'gia lai': CoffeeMarket.GIA_LAI,
      'đắk nông': CoffeeMarket.DAK_NONG,
      'dak nong': CoffeeMarket.DAK_NONG,
      'kon tum': CoffeeMarket.KON_TUM,
      'hồ tiêu': CoffeeMarket.HO_TIEU,
      'ho tieu': CoffeeMarket.HO_TIEU,
      'usd/vnd': CoffeeMarket.USD_VND,
      'tỷ giá': CoffeeMarket.USD_VND,
    };
    for (const [key, value] of Object.entries(mapping)) {
      if (normalized.includes(key)) return value;
    }
    return null;
  }

  // Parse Vietnamese number: "95,800" or "95.800" -> 95800
  private parseVietnameseNumber(text: string): number | null {
    const cleaned = text.replace(/[^\d.,-]/g, '').replace(/[.,]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }
```

#### Section F: Upsert + CRUD Queries

```typescript
  private async upsertPrices(prices: Partial<CoffeePrice>[]): Promise<void> {
    for (const price of prices) {
      await this.coffeePriceRepo
        .createQueryBuilder()
        .insert()
        .into(CoffeePrice)
        .values(price)
        .orUpdate(['average_price', 'price_change', 'market_label', 'unit'], ['date', 'market'])
        .execute();
    }
  }

  async findAll(query: QueryCoffeePriceDto): Promise<CoffeePrice[]> {
    const qb = this.coffeePriceRepo.createQueryBuilder('cp')
      .orderBy('cp.date', 'DESC');

    if (query.market) qb.andWhere('cp.market = :market', { market: query.market });
    if (query.from) qb.andWhere('cp.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('cp.date <= :to', { to: query.to });
    qb.take(parseInt(query.limit || '30', 10));

    return qb.getMany();
  }

  async findLatest(): Promise<CoffeePrice[]> {
    const subQuery = this.coffeePriceRepo
      .createQueryBuilder('sub')
      .select('MAX(sub.date)')
      .getQuery();

    return this.coffeePriceRepo
      .createQueryBuilder('cp')
      .where(`cp.date = (${subQuery})`)
      .orderBy('cp.market', 'ASC')
      .getMany();
  }
}
```

### Important: Selector Discovery

The exact table selectors (step D) **must be verified** by running Puppeteer locally against the actual page before finalizing. The brainstorm confirmed the page is Cloudflare-protected, so a real browser execution is needed to see the rendered HTML.

**During implementation:**
1. Run Puppeteer locally with `headless: false` to visually inspect
2. Use `page.content()` to dump full HTML
3. Identify correct table/row/cell selectors
4. Update `parseHtml()` accordingly

## Related Code Files

- **Create:** `src/coffee-price/coffee-price.service.ts`

## Todo

- [ ] Create service file with all sections (A-F)
- [ ] Run Puppeteer locally to determine exact CSS selectors
- [ ] Adjust `parseHtml()` selectors based on actual page structure
- [ ] Test `parseVietnameseNumber()` with edge cases
- [ ] Test `matchMarket()` with actual market names from site
- [ ] Verify upsert works (run scrape twice, check no duplicates)
- [ ] Verify build: `yarn build`

## Success Criteria

- Cron job runs at midnight Asia/Ho_Chi_Minh
- Scraping extracts all market prices from the page
- Upsert prevents duplicate entries for same date+market
- Retry logic handles transient failures (3 attempts)
- Browser always closed in `finally` block
- Scrape completes in under 60 seconds

## Risk Assessment

- **Selector breakage:** Isolate parsing in `parseHtml()` for easy updates
- **Cloudflare escalation:** If Puppeteer gets blocked, consider `puppeteer-extra` with stealth plugin
- **Memory:** Chromium uses ~200-500MB briefly; acceptable for once-daily
