import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsObject,
  IsDateString,
  Matches,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleType } from '../entities/device-schedule.entity';

export class CreateDeviceScheduleDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ScheduleType })
  @IsEnum(ScheduleType)
  type: ScheduleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  command: string;

  @ApiPropertyOptional({ default: {} })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiPropertyOptional({ example: [1, 3, 5], description: '0=Sun, 6=Sat' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ example: '06:00', description: 'HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'time must be in HH:mm format' })
  time?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date for one-time schedules' })
  @IsOptional()
  @IsDateString()
  executeAt?: string;

  @ApiPropertyOptional({ default: 'UTC', example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
