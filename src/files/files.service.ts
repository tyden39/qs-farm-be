import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, In } from 'typeorm';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { basename } from 'path';

import { File } from './entities/file.entity';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async findById(id: string): Promise<File | null> {
    const file = await this.fileRepository.findOne({
      where: { id },
    });

    return file || null;
  }

  async findByIds(ids: string[]): Promise<File[]> {
    return this.fileRepository.find({
      where: {
        id: In(ids),
      },
    });
  }

  async create(file: Express.Multer.File): Promise<{ file: File }> {
    if (!file) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'selectFile',
        },
      });
    }

    const apiPrefix = this.configService.get('app.apiPrefix', {
      infer: true,
    }) || 'api';
    
    // Get filename from file.filename, file.path, or generate it
    // Multer with diskStorage should set file.filename, but if not, extract from path
    let filename = file.filename;
    if (!filename && file.path) {
      filename = basename(file.path);
    }
    // If still no filename, generate it using the same logic as multer config
    if (!filename) {
      const extension = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      filename = `${randomStringGenerator()}.${extension}`;
    }
    
    // Store only the filename, the full URL will be constructed when needed
    const fileEntity = this.fileRepository.create({
      path: `/${apiPrefix}/v1/files/${filename}`,
    });

    const savedFile = await this.fileRepository.save(fileEntity);

    return {
      file: savedFile,
    };
  }
}
