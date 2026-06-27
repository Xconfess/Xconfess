import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TotpDisableDto {
  @ApiProperty({ description: 'Current password to verify identity before disabling 2FA', example: 'password123' })
  @IsNotEmpty()
  @IsString()
  password!: string;
}
