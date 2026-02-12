import { PartialType } from '@nestjs/swagger';
import { CreateSensorConfigDto } from './create-sensor-config.dto';

export class UpdateSensorConfigDto extends PartialType(CreateSensorConfigDto) {}
