import { PartialType } from '@nestjs/swagger';
import { CreateDeviceScheduleDto } from './create-device-schedule.dto';

export class UpdateDeviceScheduleDto extends PartialType(
  CreateDeviceScheduleDto,
) {}
