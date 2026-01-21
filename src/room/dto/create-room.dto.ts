import { IsOptional, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsOptional()
  @IsString()
  readonly avatar?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}
