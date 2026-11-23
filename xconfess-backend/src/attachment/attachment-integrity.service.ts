import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Attachment, AttachmentStatus } from './entities/attachment.entity';
import { AttachmentResponseDto } from './dto/attachment-response.dto';

/**
 * Validates an attachment record before it is served to a client, and
 * strips it down to a response DTO that cannot leak storage identifiers.
 *
 * Checks run in this order on purpose:
 *   1. Ownership       — an unauthorized requester learns nothing further.
 *   2. Record shape    — the row itself must describe a real, complete file.
 *   3. Lifecycle state — only a COMPLETED upload has a file worth serving.
 *
 * Every failure throws the SAME generic 404. This repo does not yet
 * integrate with object storage (no S3/Minio client exists in the
 * codebase as of this PR), so this service validates the persisted
 * record's internal consistency. Comparing the record against the real
 * stored object (size/type/checksum from a HEAD request) will need to
 * be added here once storage integration exists — see PR notes.
 */
@Injectable()
export class AttachmentIntegrityService {
  private readonly logger = new Logger(AttachmentIntegrityService.name);

  assertServableAndSanitize(
    attachment: Attachment | null,
    requesterOwnedAnonymousIds: string[],
  ): AttachmentResponseDto {
    if (!attachment) {
      this.reject('unknown', 'not_found');
    }

    const a = attachment as Attachment;

    // 1. Ownership first.
    if (
      !a.anonymousUserId ||
      !requesterOwnedAnonymousIds.includes(a.anonymousUserId)
    ) {
      this.reject(a.id, 'owner_mismatch');
    }

    // 2. The record must describe a complete, real file.
    // size is a bigint column -> TypeORM returns it as a string.
    const size = Number(a.size);
    if (
      !a.objectKey ||
      a.size == null ||
      Number.isNaN(size) ||
      size <= 0 ||
      !a.mimeType
    ) {
      this.reject(a.id, 'record_incomplete');
    }

    // 3. Only a finished upload is servable.
    if (a.status !== AttachmentStatus.COMPLETED) {
      this.reject(a.id, 'not_ready');
    }

    // 4. A COMPLETED record must carry the timestamp that proves it.
    if (!a.completedAt) {
      this.reject(a.id, 'inconsistent_state');
    }

    return this.toSafeDto(a);
  }

  private toSafeDto(a: Attachment): AttachmentResponseDto {
    return {
      id: a.id,
      originalName: a.originalName,
      size: Number(a.size),
      mimeType: a.mimeType,
      type: a.type,
      status: a.status,
      confessionId: a.confessionId,
      messageId: a.messageId,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      // objectKey intentionally omitted.
    };
  }

  private reject(attachmentId: string, reason: string): never {
    // reason + id only — never the objectKey — logged server-side.
    this.logger.warn(`Attachment ${attachmentId} rejected: ${reason}`);
    throw new NotFoundException('Attachment unavailable');
  }
}
