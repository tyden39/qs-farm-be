import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { FarmService } from './farm.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FilesService } from 'src/files/files.service';

@ApiTags('Farms')
@Controller('farm')
export class FarmController {
  constructor(
    private readonly farmService: FarmService,
    private readonly filesService: FilesService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  async findAll(@Req() req: any) {
    return this.farmService.findAll(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.farmService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  async create(
    @Req() req: any,
    @Body() createFarmDto: CreateFarmDto,
  ) {
    return this.farmService.create(createFarmDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['name'],
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async createWithUpload(
    @Req() req: any,
    @Body('name') name: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = '';
    
    if (file) {
      const uploadedFile = await this.filesService.create(file);
      imageUrl = uploadedFile.file.path;
    }

    return this.farmService.create(
      { name, image: imageUrl },
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateFarmDto: UpdateFarmDto,
  ) {
    return this.farmService.update(id, updateFarmDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.farmService.remove(id);
  }
}
