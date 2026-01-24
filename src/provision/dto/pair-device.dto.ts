import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PairDeviceDto {
  @ApiProperty({ description: 'Device serial number', example: 'SN123456789' })
  @IsString()
  serial: string;

  @ApiProperty({ description: 'Farm UUID to pair device with', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  farmId: string;
}
