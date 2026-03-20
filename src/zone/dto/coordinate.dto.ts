import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CoordinateDto {
  @ApiProperty()
  @IsNumber()
  lat: number;

  @ApiProperty()
  @IsNumber()
  lng: number;
}
