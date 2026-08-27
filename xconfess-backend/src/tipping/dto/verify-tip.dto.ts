import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTipDto {
  @ApiProperty({
    description: 'Stellar transaction ID — 64-character hexadecimal string.',
    example: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
    pattern: '^[a-fA-F0-9]{64}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'Transaction ID must be a valid 64-character hex string',
  })
  txId: string;
}
