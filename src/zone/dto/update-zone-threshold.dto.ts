import { PartialType } from '@nestjs/swagger';
import { CreateZoneThresholdDto } from './create-zone-threshold.dto';

export class UpdateZoneThresholdDto extends PartialType(
  CreateZoneThresholdDto,
) {}
