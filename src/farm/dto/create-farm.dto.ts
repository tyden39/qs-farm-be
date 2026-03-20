import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoordinateDto } from 'src/zone/dto/coordinate.dto';

export class CreateFarmDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly image?: string;

  @ApiPropertyOptional({ type: [CoordinateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  readonly coordinates?: CoordinateDto[];
}
