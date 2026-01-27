import { IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  username: string;

  @IsString()
  otp: string;
}
