import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly filesService: FilesService,
  ) {}

  async findAll() {
    const users = await this.userRepository.find();

    return users;
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne(id, {
      relations: ['farms'],
    });

    if (!user) {
      throw new NotFoundException(`There is no user under id ${id}`);
    }

    return user;
  }

  async findOneByUsername(username: string) {
    const user = await this.userRepository.findOne({ username });

    return user;
  }

  async findOneByEmail(email: string) {
    const user = await this.userRepository.findOne({ email });

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const user = await this.userRepository.create({
      ...createUserDto,
      avatar: createUserDto.avatar || 'https://ui-avatars.com/api/?name=' + createUserDto.username,
      is_admin: createUserDto.is_admin || false,
    });

    return this.userRepository.save(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.preload({
      id,
      ...updateUserDto,
    });

    if (!user) {
      throw new NotFoundException(`There is no user under id ${id}`);
    }

    return this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.findOne(id);

    return this.userRepository.remove(user);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.findOne(userId);

    const uploadedFile = await this.filesService.create(file);

    user.avatar = uploadedFile.file.path;

    return this.userRepository.save(user);
  }

  async removeAll() {
    const users = await this.userRepository.find();

    return this.userRepository.remove(users);
  }
}
