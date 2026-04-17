import { IsString, IsOptional, Matches, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type FirmwareTargetType = 'device' | 'gateway';

export class UploadFirmwareDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Firmware binary file (.bin)',
  })
  file: Express.Multer.File;

  @ApiProperty({ example: '1.0.0', description: 'Semver version string' })
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'Version must be semver (e.g. 1.0.0)',
  })
  version: string;

  @ApiProperty({ example: 'esp32', description: 'Hardware model identifier' })
  @IsString()
  hardwareModel: string;

  @ApiProperty({
    enum: ['device', 'gateway'],
    default: 'device',
    required: false,
    description: 'Which target this firmware is for',
  })
  @IsOptional()
  @IsIn(['device', 'gateway'])
  targetType?: FirmwareTargetType;

  @ApiProperty({ example: 'Bug fixes and improvements', required: false })
  @IsOptional()
  @IsString()
  releaseNotes?: string;
}
