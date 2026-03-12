---
title: "Coffee Price Scraping Module"
description: "Add daily Vietnamese coffee price scraping via Puppeteer with REST API endpoints"
status: complete
priority: P2
effort: 3h
branch: master
tags: [feature, scraping, coffee-price, puppeteer]
created: 2026-03-12
completed: 2026-03-12
---

# Coffee Price Scraping Module

## Overview

New standalone `CoffeePriceModule` that scrapes daily Vietnamese domestic coffee prices from giacaphe.com using Puppeteer (Cloudflare-protected site), stores in PostgreSQL, exposes via JWT-protected REST API.

## Key Decisions

- **Puppeteer@19.x** (CommonJS compat with NestJS 8) -- Cloudflare blocks plain HTTP
- **Cheerio** for HTML parsing after Puppeteer renders the page
- **Same table** for all markets: coffee, pepper, USD/VND
- **UNIQUE(date, market)** constraint prevents duplicates; upsert on conflict
- **@Cron** from existing `@nestjs/schedule@1.1.0` (already installed via ScheduleModule)
- **UUID PK** consistent with all other entities

## File Structure

```
src/coffee-price/
  entities/coffee-price.entity.ts
  enums/coffee-market.enum.ts
  dto/query-coffee-price.dto.ts
  coffee-price.service.ts        # scraping + CRUD (~180 lines)
  coffee-price.controller.ts     # REST endpoints (~60 lines)
  coffee-price.module.ts         # module registration (~20 lines)
```

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 1 | [Dependencies & Module Setup](./phase-01-setup.md) | coffee-price.module.ts, app.module.ts | complete | 15m |
| 2 | [Entity, Enum, DTO](./phase-02-entity-dto.md) | entity, enum, dto files | complete | 30m |
| 3 | [Scraping Service](./phase-03-scraping-service.md) | coffee-price.service.ts | complete | 1.5h |
| 4 | [REST Controller](./phase-04-controller.md) | coffee-price.controller.ts | complete | 30m |
| 5 | [Testing & Verification](./phase-05-testing.md) | manual + build verification | complete | 15m |

## Progress

**Overall: 100% complete** (5/5 phases)

- Setup (Phase 1): puppeteer@19.11.1, cheerio@1.2.0, CoffeePriceModule registered
- Data Layer (Phase 2): CoffeePrice entity, CoffeeMarket enum, QueryCoffeePriceDto created
- Scraping (Phase 3): Puppeteer daily cron (midnight Vietnam time), Cheerio parsing, upsert with batch optimization
- API (Phase 4): GET /api/coffee-price + GET /api/coffee-price/latest, both JWT-protected
- Validation (Phase 5): Build passing, code reviewed, all 3 major review issues fixed

## Dependencies

- `puppeteer@19.x` (new)
- `cheerio` + `@types/cheerio` (new)
- `@nestjs/schedule@1.1.0` (already installed)

## Risks

- Cloudflare may eventually block Puppeteer -- monitor, consider proxy fallback
- HTML structure changes break selectors -- isolate parsing, log raw HTML on failure
- Puppeteer adds ~300MB to Docker image -- acceptable for once-daily use
