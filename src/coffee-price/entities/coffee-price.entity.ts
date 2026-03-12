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

  // ISO date string 'YYYY-MM-DD' — one record per market per day
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: CoffeeMarket })
  market: CoffeeMarket;

  // Vietnamese display name (e.g. 'Đắk Lắk')
  @Column({ type: 'varchar', length: 100 })
  marketLabel: string;

  // Price in VND/kg (null if data missing on the page)
  @Column({ type: 'double precision', nullable: true })
  averagePrice: number;

  // Daily price change in VND (null if not available)
  @Column({ type: 'double precision', nullable: true })
  priceChange: number;

  // Unit of measure — 'VND/kg' for coffee/pepper, 'VND/USD' for exchange rate
  @Column({ type: 'varchar', length: 20, default: 'VND/kg' })
  unit: string;

  @CreateDateColumn()
  createdAt: Date;
}
