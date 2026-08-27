import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class RegisterMessageKeyDto {
  @ApiProperty({
    description: 'X25519 public key (base64url, raw 32-byte key)',
    example: 'abc123-_',
  })
  @IsString()
  @Matches(BASE64URL, { message: 'publicKey must be base64url encoded' })
  @MinLength(43)
  @MaxLength(64)
  publicKey: string;

  @ApiPropertyOptional({
    description:
      'Passphrase-wrapped private key backup (client-encrypted; server cannot read)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  encryptedKeyBackup?: string;
}

export class RestoreMessageKeyDto {
  @ApiProperty({ description: 'Recovery passphrase for encrypted key backup' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  passphrase: string;
}
