import { PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateZoneDto } from './create-zone.dto';

export class UpdateZoneDto extends PartialType(
  OmitType(CreateZoneDto, ['farmId'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  checkAll?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pumpEnabled?: boolean;
}
