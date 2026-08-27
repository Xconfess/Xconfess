import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from './get-confessions.dto';

export class CreateConfessionDto {
  @ApiProperty({
    description: 'Confession message text (max 1000 characters).',
    maxLength: 1000,
    example: 'I secretly enjoy watching reality TV shows.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'Confession cannot exceed 1000 characters' })
  message: string;

  @ApiPropertyOptional({
    enum: Gender,
    description: 'Gender of the confession author.',
    example: Gender.MALE,
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Up to 3 tags to categorise the confession.',
    type: [String],
    maxItems: 3,
    example: ['relationships', 'humor'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: 'Maximum 3 tags allowed per confession' })
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Stellar blockchain transaction hash used to anchor this confession.',
    example: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
  })
  @IsOptional()
  @IsString()
  stellarTxHash?: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency key to prevent duplicate submissions.',
    example: 'idem_7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
