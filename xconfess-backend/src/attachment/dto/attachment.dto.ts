import { IsString, IsNumber, IsOptional, IsUUID, IsEnum, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentType } from '../entities/attachment.entity';

export class CreateAttachmentDto {
  @ApiProperty({ description: 'Object key in storage' })
  @IsString()
  @MaxLength(255)
  objectKey: string;

  @ApiProperty({ description: 'Original file name' })
  @IsString()
  @MaxLength(255)
  originalName: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(0)
  size: number;

  @ApiProperty({ description: 'MIME type' })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiPropertyOptional({ enum: AttachmentType, default: AttachmentType.OTHER })
  @IsOptional()
  @IsEnum(AttachmentType)
  type?: AttachmentType = AttachmentType.OTHER;

  @ApiPropertyOptional({ description: 'File checksum (e.g., SHA-256)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  checksum?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Anonymous user ID' })
  @IsOptional()
  @IsUUID()
  anonymousUserId?: string;

  @ApiPropertyOptional({ description: 'Associated confession ID' })
  @IsOptional()
  @IsUUID()
  confessionId?: string;

  @ApiPropertyOptional({ description: 'Associated message ID' })
  @IsOptional()
  @IsNumber()
  messageId?: number;

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsOptional()
  expiresAt?: Date;
}

export class CompleteAttachmentDto {
  @ApiPropertyOptional({ description: 'File checksum' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  checksum?: string;
}

export class AssociateAttachmentDto {
  @ApiPropertyOptional({ description: 'Confession ID to associate with' })
  @IsOptional()
  @IsUUID()
  confessionId?: string;

  @ApiPropertyOptional({ description: 'Message ID to associate with' })
  @IsOptional()
  @IsNumber()
  messageId?: number;
}