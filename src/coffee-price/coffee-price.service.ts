import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as puppeteer from 'puppeteer';
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

  // Runs every 2 hours Vietnam time
  @Cron('0 */2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleDailyScrape(): Promise<void> {
    this.logger.log('Starting coffee price scrape');
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        if (this.RETRY_DELAYS[attempt] > 0) {
          await new Promise((r) => setTimeout(r, this.RETRY_DELAYS[attempt]));
        }
        await this.scrapeAndStore();
        this.logger.log('Scrape completed successfully');
        return;
      } catch (error) {
        this.logger.error(`Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }
    this.logger.error('All scrape attempts failed — skipping this cycle');
  }

  async scrapeAndStore(): Promise<void> {
    let browser: puppeteer.Browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.goto(this.SCRAPE_URL, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      // Wait for the domestic price table to render
      await page.waitForSelector('#gia-noi-dia table, .price-table', {
        timeout: 15000,
      });

      // Extract data in browser context — handles CSS ::after on nested elements
      const rawRows = await page.evaluate(() => {
        // Get text including ::after content from element and all descendants
        const getText = (el: Element): string => {
          const text = el.textContent?.trim() || '';
          // Check ::after on the element itself and all children
          const allEls = [el, ...Array.from(el.querySelectorAll('*'))];
          let afterText = '';
          for (const child of allEls) {
            const after = getComputedStyle(child, '::after').content;
            if (after && after !== 'none' && after !== '""') {
              afterText = after.replace(/^['"]|['"]$/g, '');
              break; // first match wins
            }
          }
          // If ::after has content, it IS the data (not appended to textContent)
          return afterText || text;
        };
        const table = document.querySelector(
          '#gia-noi-dia table, .price-table',
        );
        if (!table) return [];
        const rows = table.querySelectorAll('tr');
        return Array.from(rows)
          .map((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return null;
            return {
              market: getText(cells[0]),
              price: getText(cells[1]),
              change: cells.length > 2 ? getText(cells[2]) : null,
            };
          })
          .filter(Boolean);
      });

      const today = new Date().toISOString().split('T')[0];
      const prices = this.mapRawRows(rawRows, today);
      if (prices.length > 0) {
        await this.upsertPrices(prices);
        this.logger.log(`Stored ${prices.length} market prices`);
      } else {
        this.logger.warn('No prices parsed — check page selectors');
      }
    } finally {
      if (browser) await browser.close();
    }
  }

  // Map raw browser-extracted rows to CoffeePrice entities
  private mapRawRows(
    rows: Array<{ market: string; price: string; change: string | null }>,
    date: string,
  ): Partial<CoffeePrice>[] {
    const results: Partial<CoffeePrice>[] = [];
    for (const row of rows) {
      if (!row) continue;
      const market = this.matchMarket(row.market);
      if (!market) continue;
      results.push({
        date,
        market,
        marketLabel: CoffeeMarketLabel[market],
        averagePrice: this.parseVietnameseNumber(row.price),
        priceChange: row.change ? this.parseVietnameseNumber(row.change) : null,
        unit: market === CoffeeMarket.USD_VND ? 'VND/USD' : 'VND/kg',
      });
    }
    this.logger.log(`Parsed ${results.length} rows from page`);
    return results;
  }

  // Map Vietnamese market display names to enum values
  private matchMarket(name: string): CoffeeMarket | null {
    const normalized = name.toLowerCase();
    const mapping: Array<[string, CoffeeMarket]> = [
      ['đắk lắk', CoffeeMarket.DAK_LAK],
      ['dak lak', CoffeeMarket.DAK_LAK],
      ['lâm đồng', CoffeeMarket.LAM_DONG],
      ['lam dong', CoffeeMarket.LAM_DONG],
      ['gia lai', CoffeeMarket.GIA_LAI],
      ['đắk nông', CoffeeMarket.DAK_NONG],
      ['dak nong', CoffeeMarket.DAK_NONG],
      ['kon tum', CoffeeMarket.KON_TUM],
      ['hồ tiêu', CoffeeMarket.HO_TIEU],
      ['ho tieu', CoffeeMarket.HO_TIEU],
      ['usd/vnd', CoffeeMarket.USD_VND],
      ['tỷ giá', CoffeeMarket.USD_VND],
    ];
    for (const [key, value] of mapping) {
      if (normalized.includes(key)) return value;
    }
    return null;
  }

  // Parse Vietnamese number format: "95,800" or "95.800" → 95800
  // Handles Unicode minus (U+2212) that may appear in HTML entities
  private parseVietnameseNumber(text: string): number | null {
    const cleaned = text
      .replace(/\u2212/g, '-') // Unicode minus → ASCII minus
      .replace(/[^\d,.-]/g, '')
      .replace(/[,.]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  // Single-query upsert: fetch all existing records for the date, then batch insert/update
  private async upsertPrices(prices: Partial<CoffeePrice>[]): Promise<void> {
    if (prices.length === 0) return;
    const date = prices[0].date;
    const existing = await this.coffeePriceRepo.find({ where: { date } });
    const existingMap = new Map(existing.map((e) => [e.market, e]));

    for (const price of prices) {
      const record = existingMap.get(price.market);
      if (record) {
        await this.coffeePriceRepo.update(record.id, {
          averagePrice: price.averagePrice,
          priceChange: price.priceChange,
          marketLabel: price.marketLabel,
          unit: price.unit,
        });
      } else {
        await this.coffeePriceRepo.save(price);
      }
    }
  }

  async findAll(query: QueryCoffeePriceDto): Promise<CoffeePrice[]> {
    const qb = this.coffeePriceRepo
      .createQueryBuilder('cp')
      .orderBy('cp.date', 'DESC')
      .addOrderBy('cp.market', 'ASC');

    if (query.market)
      qb.andWhere('cp.market = :market', { market: query.market });
    if (query.from) qb.andWhere('cp.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('cp.date <= :to', { to: query.to });
    qb.take(Math.min(parseInt(query.limit || '30', 10), 365));

    return qb.getMany();
  }

  async findLatest(): Promise<CoffeePrice[]> {
    // Subquery to get the most recent date
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
