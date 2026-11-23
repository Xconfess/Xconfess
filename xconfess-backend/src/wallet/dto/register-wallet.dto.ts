import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { WalletNetwork } from '../entities/wallet.entity';

export class RegisterWalletDto {
  @IsString() @Length(56, 56) @Matches(/^G[A-Z2-7]{55}$/) publicKey!: string;
  @IsOptional() @IsEnum(WalletNetwork) network?: WalletNetwork;
}
