import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { UserService } from 'src/user/user.service';

import { User } from 'src/user/entities/user.entity';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { LoginUserDto } from 'src/user/dto/login-user.dto';
import { ResetToken } from './entities/reset-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectRepository(ResetToken)
    private readonly resetTokenRepository: Repository<ResetToken>,
  ) {}

  async singUp(userDto: CreateUserDto) {
    const candidate = await this.userService.findOneByUsername(
      userDto.username,
    );

    if (candidate) return null;

    const hashedPassword = await bcrypt.hash(userDto.password, 7);
    const user = await this.userService.create({
      ...userDto,
      password: hashedPassword,
    });

    const tokens = await this.generateTokens(user.id, user.tokenVersion);

    return {
      ...tokens,
      token: tokens.accessToken,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async signIn(userDto: LoginUserDto) {
    const user = await this.userService.findOneByUsername(userDto.username);

    const tokens = await this.generateTokens(user.id, user.tokenVersion);

    return {
      ...tokens,
      token: tokens.accessToken,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async validateUser(userDto: LoginUserDto): Promise<User> {
    const user = await this.userService.findOneByUsername(userDto.username);

    if (!user) {
      throw new NotFoundException(`There is no user under this username`);
    }

    const passwordEquals = await bcrypt.compare(
      userDto.password,
      user.password,
    );

    if (passwordEquals) return user;

    throw new UnauthorizedException({ message: 'Incorrect password' });
  }

  verifyAccessToken(accessToken: string) {
    try {
      const payload = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      return payload;
    } catch (err) {
      return null;
    }
  }

  verifyRefreshToken(refreshToken: string) {
    const payload = this.jwtService.verify(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });

    return payload;
  }

  async updateAccessToken(refreshToken: string) {
    try {
      const payload = this.verifyRefreshToken(refreshToken);

      const user = await this.userService.findOne(payload.id);

      if (user.tokenVersion !== payload.tokenVersion) {
        return null;
      }

      const tokens = await this.generateTokens(user.id, user.tokenVersion);

      return tokens.accessToken;
    } catch (e) {
      return null;
    }
  }

  async forgotPassword(username: string) {
    const user = await this.userService.findOneByUsername(username);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 7);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const resetToken = this.resetTokenRepository.create({
      userId: user.id,
      otpHash,
      expiresAt,
    });

    await this.resetTokenRepository.save(resetToken);

    return { otp, message: 'OTP generated successfully' };
  }

  async verifyOtp(username: string, otp: string) {
    const user = await this.userService.findOneByUsername(username);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const resetTokenEntity = await this.resetTokenRepository.findOne({
      where: {
        userId: user.id,
        used: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!resetTokenEntity) {
      throw new BadRequestException('No valid OTP found');
    }

    const isOtpValid = await bcrypt.compare(otp, resetTokenEntity.otpHash);

    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP');
    }

    const resetToken = uuidv4();

    resetTokenEntity.resetToken = resetToken;
    resetTokenEntity.used = true;

    await this.resetTokenRepository.save(resetTokenEntity);

    return { resetToken };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userService.findOne(userId);

    const passwordEquals = await bcrypt.compare(currentPassword, user.password);

    if (!passwordEquals) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 7);
    const newTokenVersion = user.tokenVersion + 1;

    await this.userService.update(userId, {
      password: hashedPassword,
      tokenVersion: newTokenVersion,
    });

    const tokens = await this.generateTokens(userId, newTokenVersion);

    return {
      message: 'Password changed successfully',
      ...tokens,
    };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const resetTokenEntity = await this.resetTokenRepository.findOne({
      where: {
        resetToken,
        used: true,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!resetTokenEntity) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.userService.findOne(resetTokenEntity.userId);
    const hashedPassword = await bcrypt.hash(newPassword, 7);

    await this.userService.update(user.id, {
      password: hashedPassword,
      tokenVersion: user.tokenVersion + 1,
    });

    await this.resetTokenRepository.remove(resetTokenEntity);

    return { message: 'Password reset successfully' };
  }

  private async generateTokens(id: string, tokenVersion: number) {
    const payload = { id, tokenVersion };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRE,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRE,
    });
    const tokens = { accessToken, refreshToken };

    return tokens;
  }
}
