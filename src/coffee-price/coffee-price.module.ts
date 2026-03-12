import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoffeePrice } from './entities/coffee-price.entity';
import { CoffeePriceService } from './coffee-price.service';
import { CoffeePriceController } from './coffee-price.controller';

// Note: ScheduleModule.forRoot() is already registered in ScheduleModule — no need to re-import
@Module({
  imports: [TypeOrmModule.forFeature([CoffeePrice])],
  controllers: [CoffeePriceController],
  providers: [CoffeePriceService],
})
export class CoffeePriceModule {}
