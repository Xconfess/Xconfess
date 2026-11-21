import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    description:
      'Optional client idempotency key. When provided, it is bound to the same caller/confession operation and must match on replay; mismatches are rejected safely.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9:._-]{1,128}$/, {
    message:
      'idempotencyKey must be 1-128 chars and contain only letters, numbers, colon, dot, underscore, or hyphen',
  })
  idempotencyKey?: string;
}
