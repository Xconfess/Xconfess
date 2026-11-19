import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentStatus, AttachmentType } from '../entities/attachment.entity';

/**
 * What a client is allowed to see about an attachment.
 * objectKey is deliberately never included here (issue #2019,
 * "avoid leaking object-storage identifiers").
 */
export class AttachmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  size: number;

  @ApiProperty()
  mimeType: string;

  @ApiProperty({ enum: AttachmentType })
  type: AttachmentType;

  @ApiProperty({ enum: AttachmentStatus })
  status: AttachmentStatus;

  @ApiPropertyOptional()
  confessionId: string | null;

  @ApiPropertyOptional()
  messageId: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt: Date | null;
}
