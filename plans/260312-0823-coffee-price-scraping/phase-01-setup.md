# Phase 1: Dependencies & Module Setup

## Context

- [Brainstorm Report](../reports/brainstormer-260312-0813-coffee-price-scraping.md)
- [app.module.ts](../../src/app.module.ts) -- add CoffeePriceModule import
- [schedule.module.ts](../../src/schedule/schedule.module.ts) -- reference pattern for ScheduleModule.forRoot()

## Overview

- **Priority:** P1 (blocks all other phases)
- **Status:** complete
- Install npm packages, create module file, register in AppModule

## Implementation Steps

### 1. Install dependencies

```bash
yarn add puppeteer@19 cheerio
yarn add -D @types/cheerio
```

Note: `puppeteer@19` is last major version with CommonJS support. v20+ uses ESM which conflicts with NestJS 8.

### 2. Create `src/coffee-price/coffee-price.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CoffeePrice } from './entities/coffee-price.entity';
import { CoffeePriceService } from './coffee-price.service';
import { CoffeePriceController } from './coffee-price.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([CoffeePrice]),
  ],
  controllers: [CoffeePriceController],
  providers: [CoffeePriceService],
})
export class CoffeePriceModule {}
```

Pattern follows `ScheduleModule` -- imports `ScheduleModule.forRoot()` + `TypeOrmModule.forFeature()`.

### 3. Register in `src/app.module.ts`

Add import line and add `CoffeePriceModule` to imports array after `NotificationModule`.

## Related Code Files

- **Modify:** `src/app.module.ts` (add import)
- **Create:** `src/coffee-price/coffee-price.module.ts`

## Todo

- [ ] `yarn add puppeteer@19 cheerio && yarn add -D @types/cheerio`
- [ ] Create `src/coffee-price/coffee-price.module.ts`
- [ ] Add `CoffeePriceModule` to `src/app.module.ts` imports
- [ ] Verify build: `yarn build`

## Success Criteria

- `yarn build` passes with new module registered
- No circular dependency errors
