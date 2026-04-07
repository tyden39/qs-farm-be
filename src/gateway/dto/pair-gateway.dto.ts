import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class PairGatewayDto {
  @IsString()
  @IsNotEmpty()
  pairingToken: string;

  @IsUUID()
  farmId: string;
}
