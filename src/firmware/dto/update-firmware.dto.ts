import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFirmwareDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
