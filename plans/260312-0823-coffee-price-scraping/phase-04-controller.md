# Phase 4: REST Controller

## Context

- [sensor.controller.ts](../../src/sensor/sensor.controller.ts) -- controller pattern (JWT guard, Swagger, ApiTags)
- Depends on Phase 2 (DTO) and Phase 3 (service)

## Overview

- **Priority:** P1
- **Status:** complete
- Two endpoints: list with filters + latest prices

## Implementation Steps

### 1. Create `src/coffee-price/coffee-price.controller.ts`

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

  @Get()
  findAll(@Query() query: QueryCoffeePriceDto) {
    return this.coffeePriceService.findAll(query);
  }

  @Get('latest')
  findLatest() {
    return this.coffeePriceService.findLatest();
  }
}
```

Pattern matches existing controllers:
- Class-level `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()`
- `@ApiTags()` for Swagger grouping
- Route prefix `coffee-price` -> endpoints at `/api/coffee-price` and `/api/coffee-price/latest`

### API Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/coffee-price` | JWT | List prices, filter by market/date/limit |
| GET | `/api/coffee-price/latest` | JWT | Latest scrape (all markets) |

### Response Examples

**GET /api/coffee-price?market=DAK_LAK&limit=7**
```json
[
  {
    "id": "uuid",
    "date": "2026-03-12",
    "market": "DAK_LAK",
    "marketLabel": "Đắk Lắk",
    "averagePrice": 95800,
    "priceChange": -800,
    "unit": "VND/kg",
    "createdAt": "2026-03-12T00:00:15.000Z"
  }
]
```

**GET /api/coffee-price/latest**
Returns array of all markets from the most recent scrape date.

## Related Code Files

- **Create:** `src/coffee-price/coffee-price.controller.ts`

## Todo

- [ ] Create controller file
- [ ] Verify Swagger docs show up at `/api`
- [ ] Test `GET /api/coffee-price` with query params
- [ ] Test `GET /api/coffee-price/latest`
- [ ] Verify JWT auth required (401 without token)
- [ ] Verify build: `yarn build`

## Success Criteria

- Both endpoints return correct data
- JWT auth enforced on both endpoints
- Swagger docs display query params and response correctly
- Query filters (market, from, to, limit) work as expected
