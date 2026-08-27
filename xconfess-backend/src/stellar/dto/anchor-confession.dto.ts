import {
  IsNotEmpty,
  IsString,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';

export class AnchorConfessionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'Invalid Stellar transaction hash format',
  })
  stellarTxHash: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stellarHash?: string;
}
