import { IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeployFirmwareDto {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  farmId?: string;
}
