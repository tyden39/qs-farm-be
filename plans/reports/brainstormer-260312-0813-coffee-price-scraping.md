# Brainstorm: Coffee Price Scraping Integration

**Date:** 2026-03-12  
**Status:** Complete  
**Context:** Integrate daily Vietnamese domestic coffee price scraping into NestJS IoT farm platform

---

## 1. Problem Statement

The platform needs to scrape daily Vietnamese domestic coffee prices from [giacaphe.com/gia-ca-phe-noi-dia/](https://giacaphe.com/gia-ca-phe-noi-dia/) and expose them via REST API for mobile consumption. Data includes market prices from key Central Highlands regions (Dak Lak, Lam Dong, Gia Lai, Dak Nong) plus pepper and USD/VND exchange rate.

---

## 2. Critical Finding: Cloudflare Protection

**The target website is behind Cloudflare's "managed challenge" (JavaScript challenge page).** A plain HTTP request (even with browser-like headers) returns a `403` with Cloudflare's JS challenge page instead of actual content. This is the single most important constraint.

### Implications
- `axios + cheerio` (simple HTTP + HTML parsing) **will NOT work**
- The Cloudflare challenge requires JavaScript execution to solve
- This eliminates the simplest and most common scraping approach

---

## 3. Evaluated Approaches

### Approach A: Puppeteer / Playwright (Headless Browser) -- RECOMMENDED

**How:** Launch a headless Chromium browser, navigate to the page, wait for Cloudflare challenge to resolve, then extract table HTML.

**Pros:**
- Handles Cloudflare challenges natively (real browser JS execution)
- Reliable for JS-rendered content
- Well-supported in Node.js ecosystem
- Can reuse browser instance across scrapes

**Cons:**
- Heavy dependency (~300-400MB Chromium binary)
- Higher memory/CPU usage per scrape
- Slower execution (~5-15s per page load)
- Requires Chromium to be installed on the server (Docker consideration)

**Packages:** `puppeteer` (bundles Chromium) or `puppeteer-core` + system Chromium

**Verdict:** Best fit given Cloudflare protection. Once-daily execution makes the resource overhead negligible.

### Approach B: axios + cheerio (Simple HTTP Scraping)

**How:** HTTP GET request, parse static HTML with cheerio.

**Pros:**
- Lightweight, fast, no browser dependency
- Simple code, easy to maintain
- Minimal resource usage

**Cons:**
- **BLOCKED by Cloudflare** -- will not work for this target
- No JavaScript execution capability

**Verdict:** Not viable due to Cloudflare protection.

### Approach C: Cloudflare-bypassing Libraries (e.g., cloudscraper, cf-clearance)

**How:** Use specialized libraries that attempt to solve Cloudflare challenges programmatically.

**Pros:**
- Lighter than a full browser
- Faster execution

**Cons:**
- Fragile -- breaks when Cloudflare updates their challenge
- Most Node.js options are unmaintained or unreliable
- Not a stable long-term solution
- May violate Cloudflare ToS

**Verdict:** Too fragile for production use.

### Approach D: Alternative Data Source

**How:** Use a different website or paid API for coffee price data.

**Alternatives identified:**
- [commodities-api.com](https://commodities-api.com/) -- global commodity prices but not Vietnam domestic market-specific
- USDA FAS reports -- detailed but not daily, PDF format
- [coffeeprice.vn](https://www.coffeeprice.vn/vietnam-coffee-price/) -- potential alternative source

**Pros:**
- May avoid scraping entirely if an API exists
- More reliable and maintainable

**Cons:**
- No free API found specifically for Vietnam domestic coffee prices by region
- Alternative sites may also have protection
- Paid APIs add cost

**Verdict:** Worth investigating coffeeprice.vn or other Vietnamese sources as backup, but giacaphe.com remains the user's specified source.

---

## 4. Recommended Solution: Puppeteer + Cheerio + NestJS Module

### Architecture

```
CoffeePriceModule (new)
├── entities/
│   └── coffee-price.entity.ts        # TypeORM entity
├── dto/
│   └── query-coffee-price.dto.ts     # Query params DTO
├── coffee-price.service.ts           # Scraping logic + CRUD
└── coffee-price.controller.ts        # REST endpoints
```

### Database Schema

```sql
-- Table: coffee_price
CREATE TABLE coffee_price (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL,                    -- scrape date (unique per market+date)
  market        VARCHAR(50) NOT NULL,             -- e.g., 'DAK_LAK', 'LAM_DONG', etc.
  market_label  VARCHAR(100) NOT NULL,            -- Vietnamese display name
  average_price DOUBLE PRECISION,                 -- VND/kg (nullable if data missing)
  price_change  DOUBLE PRECISION,                 -- daily change in VND
  unit          VARCHAR(20) DEFAULT 'VND/kg',     -- price unit
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, market)                            -- prevent duplicate entries
);

CREATE INDEX idx_coffee_price_date ON coffee_price(date DESC);
CREATE INDEX idx_coffee_price_market_date ON coffee_price(market, date DESC);
```

**Entity design notes:**
- UUID primary key (consistent with existing entities)
- `date` column (DATE type, not TIMESTAMP) since we scrape once/day
- `market` as enum string for querying; `market_label` for display
- Unique constraint on `(date, market)` prevents duplicate scrapes
- Nullable `average_price` handles missing data rows gracefully

**Market enum values:**
```typescript
enum CoffeeMarket {
  DAK_LAK = 'DAK_LAK',
  LAM_DONG = 'LAM_DONG',
  GIA_LAI = 'GIA_LAI',
  DAK_NONG = 'DAK_NONG',
  KON_TUM = 'KON_TUM',       // may appear on the site
  HO_TIEU = 'HO_TIEU',       // pepper price
  USD_VND = 'USD_VND',        // exchange rate
}
```

### Scraping Strategy

1. **Cron job** using `@nestjs/schedule` `@Cron('0 0 * * *')` (midnight daily, Asia/Ho_Chi_Minh timezone)
2. Launch Puppeteer, navigate to URL, wait for Cloudflare + page load
3. Extract table using `page.evaluate()` or get innerHTML then parse with cheerio
4. Parse Vietnamese number format (e.g., "95,800" -> 95800)
5. Upsert rows (handle re-runs gracefully with ON CONFLICT)
6. Close browser

**Puppeteer specifics:**
```typescript
// Pseudocode for scraping logic
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],  // for Docker/Linux
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 ...');
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
// Wait for actual content (not Cloudflare challenge)
await page.waitForSelector('table', { timeout: 15000 });
const html = await page.content();
// Parse with cheerio
browser.close();
```

### API Design

**Endpoint:** `GET /api/coffee-price`  
**Auth:** `@UseGuards(JwtAuthGuard)` (consistent with existing endpoints)  
**Query params:**
- `from?: string` (ISO date, e.g., '2026-03-01')
- `to?: string` (ISO date)
- `market?: CoffeeMarket` (filter by market)
- `limit?: number` (default 30)

**Response format:**
```json
{
  "data": [
    {
      "date": "2026-03-11",
      "market": "DAK_LAK",
      "marketLabel": "Đắk Lắk",
      "averagePrice": 95800,
      "priceChange": -800,
      "unit": "VND/kg"
    }
  ]
}
```

**Additional endpoints:**
- `GET /api/coffee-price/latest` -- returns most recent scrape (all markets)
- `GET /api/coffee-price/history/:market` -- time series for a specific market

### Module Registration

In `app.module.ts`, add `CoffeePriceModule` to imports array. No dependencies on other modules (standalone feature).

---

## 5. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Cloudflare blocks even Puppeteer | Retry 3 times with 30s delays; log error; skip day |
| Website structure changes | Cheerio selectors break; log parse errors with raw HTML for debugging |
| Missing market row | Insert NULL for averagePrice; flag in logs |
| Duplicate scrape (re-run) | UPSERT with `ON CONFLICT (date, market) DO UPDATE` |
| Network timeout | 30s page load timeout; retry logic |
| Puppeteer crash | try/catch + always close browser in `finally` block |
| Number format edge cases | Handle both "95,800" and "95.800" Vietnamese formats |
| Weekend/holiday (no new data) | Site may show previous day's data; compare dates, skip if already stored |

### Retry Strategy
```
Attempt 1 → wait 0s
Attempt 2 → wait 30s
Attempt 3 → wait 60s
All fail → log error, skip day, alert via Logger.error()
```

---

## 6. Implementation Considerations

### Docker/Deployment
- Puppeteer requires Chromium; add to Dockerfile:
  ```dockerfile
  RUN apt-get update && apt-get install -y chromium
  ```
- Or use `puppeteer` package which downloads its own Chromium
- Set `PUPPETEER_EXECUTABLE_PATH` env var if using system Chromium
- Memory: allocate at least 512MB extra for Chromium process

### Performance
- Once-daily execution: negligible performance impact
- Browser launch + page load: ~10-20s total
- Database: small dataset (6-7 rows/day = ~2500 rows/year)
- No need for caching on the read API given tiny dataset

### Dependencies to Add
```bash
yarn add puppeteer cheerio
yarn add -D @types/cheerio
```

Note: `puppeteer` v21+ ships ESM; verify compatibility with NestJS 8 + TypeScript 4.x. May need `puppeteer@19.x` for CommonJS compatibility.

### File Structure
```
src/coffee-price/
├── entities/
│   └── coffee-price.entity.ts
├── enums/
│   └── coffee-market.enum.ts
├── dto/
│   └── query-coffee-price.dto.ts
├── coffee-price.service.ts
├── coffee-price.controller.ts
└── coffee-price.module.ts
```

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Cloudflare blocks Puppeteer long-term | Medium | Monitor; consider residential proxy or alternative source as fallback |
| Website HTML structure changes | Medium | Isolate parsing logic; log raw HTML on parse failure for quick fixes |
| Puppeteer version incompatibility with NestJS 8 | Low | Pin to puppeteer@19.x (CommonJS, stable) |
| Legal/ToS concerns | Low | Once-daily scrape is minimal load; data is publicly displayed |
| Server resource spike during scrape | Low | Once-daily, off-peak (midnight); brief Chromium lifetime |

---

## 8. Success Criteria

- [ ] Daily scrape at midnight (Asia/Ho_Chi_Minh) stores all market prices
- [ ] API returns correct data with date/market filtering
- [ ] Retry logic handles transient failures gracefully
- [ ] No duplicate entries for same date+market
- [ ] Mobile app can display latest prices and historical data
- [ ] Scrape completes in under 60 seconds
- [ ] Graceful degradation when website is unavailable

---

## 9. Unresolved Questions

1. **Puppeteer version:** Need to verify which version works with NestJS 8 + TypeScript 4.x (CommonJS requirement). Should test `puppeteer@19` vs `puppeteer@21+`.
2. **Website table selectors:** Could not fetch actual HTML due to Cloudflare. The exact CSS selectors for the price table need to be determined during implementation (by running Puppeteer locally first).
3. **Pepper and USD/VND rows:** User mentioned "Ho tieu" (pepper) and "Ty gia USD/VND" -- confirm if these should be stored in the same table or if they are conceptually different data types requiring separate handling.
4. **Authentication requirement:** Should the coffee price API be public (no auth) for wider consumption, or protected with JwtAuthGuard like other endpoints?
5. **Notification:** Should the system push notifications to farm owners when coffee prices change significantly?
6. **Historical backfill:** Does the user need to backfill historical data, or is starting from today sufficient?
7. **Alternative/fallback source:** If giacaphe.com becomes permanently inaccessible, what alternative data source should be used?

---

## 10. Next Steps

1. Verify Puppeteer compatibility locally by running a test scrape
2. Determine exact HTML selectors from the live page
3. Create implementation plan if approach is approved
