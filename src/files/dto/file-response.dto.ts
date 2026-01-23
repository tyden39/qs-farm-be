import { ApiProperty } from '@nestjs/swagger';
import { File } from '../entities/file.entity';

export class FileResponseDto {
  @ApiProperty({
    type: () => File,
  })
  file: File;
}
