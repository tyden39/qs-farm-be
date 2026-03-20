import { PartialType } from '@nestjs/swagger';
import { CreateZoneSensorConfigDto } from './create-zone-sensor-config.dto';

export class UpdateZoneSensorConfigDto extends PartialType(CreateZoneSensorConfigDto) {}
