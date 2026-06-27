import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class TotpEnableDto {
  @ApiProperty({ description: '6-digit TOTP verification code from authenticator app', example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  totpCode!: string;
}
