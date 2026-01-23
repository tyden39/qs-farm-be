import { IsString, IsOptional } from 'class-validator';

export class CreateFarmDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly image?: string;
}
