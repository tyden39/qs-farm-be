import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class AssignDevicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  deviceIds: string[];
}
