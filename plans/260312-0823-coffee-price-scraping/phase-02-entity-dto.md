# Phase 2: Entity, Enum, DTO

## Context

- [sensor-data.entity.ts](../../src/sensor/entities/sensor-data.entity.ts) -- entity pattern reference
- [sensor-type.enum.ts](../../src/sensor/enums/sensor-type.enum.ts) -- enum pattern reference
- [query-sensor-data.dto.ts](../../src/sensor/dto/query-sensor-data.dto.ts) -- DTO pattern reference

## Overview

- **Priority:** P1 (blocks Phase 3 & 4)
- **Status:** complete
- Create CoffeeMarket enum, CoffeePrice entity, QueryCoffeePriceDto

## Implementation Steps

### 1. Create `src/coffee-price/enums/coffee-market.enum.ts`

```typescript
export enum CoffeeMarket {
  DAK_LAK = 'DAK_LAK',
  LAM_DONG = 'LAM_DONG',
  GIA_LAI = 'GIA_LAI',
  DAK_NONG = 'DAK_NONG',
  KON_TUM = 'KON_TUM',
  HO_TIEU = 'HO_TIEU',     // pepper
  USD_VND = 'USD_VND',      // exchange rate
}

// Vietnamese display labels for each market
export const CoffeeMarketLabel: Record<CoffeeMarket, string> = {
  [CoffeeMarket.DAK_LAK]: 'Đắk Lắk',
  [CoffeeMarket.LAM_DONG]: 'Lâm Đồng',
  [CoffeeMarket.GIA_LAI]: 'Gia Lai',
  [CoffeeMarket.DAK_NONG]: 'Đắk Nông',
  [CoffeeMarket.KON_TUM]: 'Kon Tum',
  [CoffeeMarket.HO_TIEU]: 'Hồ tiêu',
  [CoffeeMarket.USD_VND]: 'Tỷ giá USD/VND',
};
```

### 2. Create `src/coffee-price/entities/coffee-price.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { CoffeeMarket } from '../enums/coffee-market.enum';

@Entity()
@Unique(['date', 'market'])
@Index(['date'])
@Index(['market', 'date'])
export class CoffeePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  date: string;            // ISO date string 'YYYY-MM-DD'

  @Column({ type: 'enum', enum: CoffeeMarket })
  market: CoffeeMarket;

  @Column({ type: 'varchar', length: 100 })
  marketLabel: string;     // Vietnamese display name

  @Column({ type: 'double precision', nullable: true })
  averagePrice: number;    // VND/kg (null if data missing)

  @Column({ type: 'double precision', nullable: true })
  priceChange: number;     // daily change in VND

  @Column({ type: 'varchar', length: 20, default: 'VND/kg' })
  unit: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

Key decisions:
- `date` as DATE type (not TIMESTAMP) -- one scrape per day
- `UNIQUE(date, market)` -- prevents duplicates, enables upsert
- `nullable: true` on price fields -- handles missing data rows
- UUID PK consistent with project convention

### 3. Create `src/coffee-price/dto/query-coffee-price.dto.ts`

```typescript
import { IsEnum, IsOptional, IsDateString, IsNumberString } from 'class-validator';
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
```

Follows exact pattern from `QuerySensorDataDto`: class-validator decorators, `@ApiPropertyOptional`, string-typed limit.

## Related Code Files

- **Create:** `src/coffee-price/enums/coffee-market.enum.ts`
- **Create:** `src/coffee-price/entities/coffee-price.entity.ts`
- **Create:** `src/coffee-price/dto/query-coffee-price.dto.ts`

## Todo

- [ ] Create enum file with markets + Vietnamese labels map
- [ ] Create entity with UUID PK, UNIQUE constraint, indexes
- [ ] Create DTO with class-validator + Swagger decorators
- [ ] Verify build: `yarn build`

## Success Criteria

- Build passes
- TypeORM auto-creates `coffee_price` table with correct columns on app start
- UNIQUE constraint on (date, market) verified
