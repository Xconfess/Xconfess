import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttachmentRepository } from './repository/attachment.repository';
import { Attachment, AttachmentStatus, AttachmentType } from './entities/attachment.entity';

export interface CleanupResult {
  abandonedCount: number;
  deletedCount: number;
  errors: string[];
}

/**
 * Issue #2124: outcome of a sweep over attachments whose referenced
 * message has been deleted.
 *
 * - `detachedCount`    attachments whose only stale reference was the
 *                      messageId; the row is kept (confession still
 *                      links it) and messageId is cleared.
 * - `abandonedCount`   attachments marked ABANDONED because no other
 *                      valid reference remained.
 * - `deletedCount`     abandoned rows that were then deleted in the
 *                      same sweep (the two steps are safe to re-run).
 * - `errors`           per-attachment error strings; a failure on one
 *                      row does not stop the sweep.
 */
export interface DeletedMessageCleanupResult {
  scanned: number;
  detachedCount: number;
  abandonedCount: number;
  deletedCount: number;
  errors: string[];
}

@Injectable()
export class AttachmentCleanupService {
  private readonly logger = new Logger(AttachmentCleanupService.name);

  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Grace period in milliseconds before considering an attachment abandoned.
   * Default: 24 hours.
   */
  private get gracePeriodMs(): number {
    return this.configService.get<number>('ATTACHMENT_CLEANUP_GRACE_PERIOD_MS') ?? 24 * 60 * 60 * 1000;
  }

  /**
   * Maximum number of attachments to process in a single cleanup run.
   * Default: 1000.
   */
  private get batchSize(): number {
    return this.configService.get<number>('ATTACHMENT_CLEANUP_BATCH_SIZE') ?? 1000;
  }

  /**
   * Run the cleanup job.
   * This is idempotent and safe to run multiple times.
   */
  async runCleanup(): Promise<CleanupResult> {
    this.logger.log('Starting attachment cleanup job');
    const errors: string[] = [];
    let abandonedCount = 0;
    let deletedCount = 0;

    try {
      // Find candidates for cleanup
      const candidates = await this.attachmentRepository.findCleanupCandidates(this.gracePeriodMs);
      this.logger.log(`Found ${candidates.length} attachment(s) eligible for cleanup`);

      if (candidates.length === 0) {
        return { abandonedCount: 0, deletedCount: 0, errors: [] };
      }

      // Process in batches
      for (let i = 0; i < candidates.length; i += this.batchSize) {
        const batch = candidates.slice(i, i + this.batchSize);
        const ids = batch.map((a) => a.id);

        try {
          // First, mark as abandoned (idempotent)
          const marked = await this.attachmentRepository.markAsAbandoned(ids);
          abandonedCount += marked;
          this.logger.log(`Marked ${marked} attachment(s) as abandoned in batch ${i / this.batchSize + 1}`);

          // Then, delete abandoned attachments (idempotent)
          const deleted = await this.attachmentRepository.deleteAbandonedAttachments(ids);
          deletedCount += deleted;
          this.logger.log(`Deleted ${deleted} abandoned attachment(s) in batch ${i / this.batchSize + 1}`);
        } catch (error) {
          const errorMsg = `Batch ${i / this.batchSize + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logger.log(
        `Attachment cleanup completed: ${abandonedCount} marked abandoned, ${deletedCount} deleted, ${errors.length} errors`,
      );
    } catch (error) {
      const errorMsg = `Cleanup job failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg, error instanceof Error ? error.stack : undefined);
      errors.push(errorMsg);
    }

    return { abandonedCount, deletedCount, errors };
  }

  /**
   * Scheduled cleanup job - runs daily at 3 AM.
   *
   * Sweeps abandoned uploads (grace-period expired) and attachments
   * whose referenced message has been deleted (Issue #2124). Each sweep
   * is idempotent and safe to re-run, so a failure on one does not
   * suppress the other and a partial-failure first pass heals on the
   * next scheduled run.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledCleanup(): Promise<void> {
    this.logger.log('Running scheduled attachment cleanup');
    const result = await this.runCleanup();

    if (result.errors.length > 0) {
      this.logger.warn(`Scheduled cleanup completed with errors: ${result.errors.join('; ')}`);
    }

    try {
      const dm = await this.cleanupAttachmentsForDeletedMessages();
      this.logger.log(
        `Deleted-message sweep: scanned=${dm.scanned}, detached=${dm.detachedCount}, abandoned=${dm.abandonedCount}, deleted=${dm.deletedCount}, errors=${dm.errors.length}`,
      );
      if (dm.errors.length > 0) {
        this.logger.warn(
          `Deleted-message sweep completed with errors: ${dm.errors.join('; ')}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Deleted-message sweep failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Issue #2124: deleted-message attachment cleanup.
   *
   * Finds attachments whose `messageId` points to a message row that no
   * longer exists. For each:
   *   - if `confessionId` is still set, clear the stale message link
   *     (the attachment stays valid for the confession);
   *   - otherwise, mark it ABANDONED and let the abandoned-delete step
   *     reap it in the same sweep.
   *
   * The two underlying repository calls (`markAsAbandoned`,
   * `deleteAbandonedAttachments`) are already idempotent: they skip rows
   * that are already in the target state. A failure on one attachment
   * is captured in `errors` and the sweep continues; re-running after a
   * partial failure finishes the remaining work without double-processing
   * anything.
   */
  async cleanupAttachmentsForDeletedMessages(
    limit: number = this.batchSize,
  ): Promise<DeletedMessageCleanupResult> {
    const result: DeletedMessageCleanupResult = {
      scanned: 0,
      detachedCount: 0,
      abandonedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    let candidates: Attachment[];
    try {
      candidates = await this.attachmentRepository.findAttachmentsForDeletedMessages(limit);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`candidate scan failed: ${msg}`);
      return result;
    }

    result.scanned = candidates.length;
    if (candidates.length === 0) {
      return result;
    }

    const toAbandonIds: string[] = [];

    for (const attachment of candidates) {
      try {
        if (attachment.confessionId) {
          const changed = await this.attachmentRepository.clearMessageReference(attachment.id);
          result.detachedCount += changed;
        } else {
          toAbandonIds.push(attachment.id);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`attachment ${attachment.id}: ${msg}`);
      }
    }

    if (toAbandonIds.length > 0) {
      try {
        result.abandonedCount = await this.attachmentRepository.markAsAbandoned(toAbandonIds);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`mark-abandoned batch failed: ${msg}`);
      }

      try {
        result.deletedCount =
          await this.attachmentRepository.deleteAbandonedAttachments(toAbandonIds);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`delete-abandoned batch failed: ${msg}`);
      }
    }

    return result;
  }

  /**
   * Manually trigger cleanup for a specific attachment (e.g., after failed transaction).
   */
  async cleanupAttachment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const attachment = await this.attachmentRepository.findById(id);
      if (!attachment) {
        return { success: false, error: 'Attachment not found' };
      }

      // Only clean up if not referenced
      if (await this.attachmentRepository.isReferenced(id)) {
        return { success: false, error: 'Attachment is still referenced' };
      }

      // Mark as abandoned
      await this.attachmentRepository.markAsAbandoned([id]);
      
      // Delete if already abandoned or failed
      if (attachment.status === AttachmentStatus.ABANDONED || attachment.status === AttachmentStatus.FAILED) {
        await this.attachmentRepository.deleteAbandonedAttachments([id]);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cleanup attachment ${id}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create an attachment record for a new upload.
   */
  async createAttachment(data: {
    objectKey: string;
    originalName: string;
    size: number;
    mimeType: string;
    type?: AttachmentType;
    checksum?: string;
    metadata?: Record<string, any>;
    anonymousUserId?: string;
    confessionId?: string;
    messageId?: number;
    expiresAt?: Date;
  }): Promise<Attachment> {
    return this.attachmentRepository.create({
      ...data,
      status: AttachmentStatus.UPLOADING,
      type: data.type ?? AttachmentType.OTHER,
    });
  }

  /**
   * Mark attachment as completed after successful upload.
   */
  async completeAttachment(id: string, checksum?: string): Promise<void> {
    await this.attachmentRepository.updateStatus(id, AttachmentStatus.COMPLETED, {
      completedAt: new Date(),
      checksum,
    });
  }

  /**
   * Mark attachment as failed.
   */
  async failAttachment(id: string, reason: string): Promise<void> {
    await this.attachmentRepository.updateStatus(id, AttachmentStatus.FAILED, {
      failedAt: new Date(),
      failureReason: reason,
    });
  }

  /**
   * Associate attachment with a confession or message after successful transaction.
   */
  async associateAttachment(
    id: string,
    association: { confessionId?: string; messageId?: number },
  ): Promise<void> {
    await this.attachmentRepository.updateStatus(id, AttachmentStatus.COMPLETED, association);
  }
}