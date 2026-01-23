import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { FarmModule } from './farm/farm.module';
import { DeviceModule } from './device/device.module';
import { FilesModule } from './files/files.module';
import { EmqxModule } from './emqx/emqx.module';
import { ProvisionModule } from './provision/provision.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
    }),
    UserModule,
    AuthModule,
    FarmModule,
    DeviceModule,
    FilesModule,
    EmqxModule,
    ProvisionModule,
  ],
  providers: [],
})
export class AppModule {}
