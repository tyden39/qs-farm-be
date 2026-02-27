import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UnprocessableEntityException } from '@nestjs/common';

import { Firmware } from './entities/firmware.entity';
import { FirmwareUpdateLog } from './entities/firmware-update-log.entity';
import { FirmwareController } from './firmware.controller';
import { FirmwareService } from './firmware.service';
import { DeviceModule } from 'src/device/device.module';
import { FarmModule } from 'src/farm/farm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Firmware, FirmwareUpdateLog]),
    MulterModule.register({
      storage: diskStorage({
        destination: './files/firmware',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}.bin`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.bin$/i)) {
          return cb(
            new UnprocessableEntityException('Only .bin files allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 4 * 1024 * 1024 },
    }),
    DeviceModule,
    FarmModule,
  ],
  controllers: [FirmwareController],
  providers: [FirmwareService],
  exports: [FirmwareService],
})
export class FirmwareModule {}
