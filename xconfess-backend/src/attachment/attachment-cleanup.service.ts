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
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledCleanup(): Promise<void> {
    this.logger.log('Running scheduled attachment cleanup');
    const result = await this.runCleanup();
    
    if (result.errors.length > 0) {
      this.logger.warn(`Scheduled cleanup completed with errors: ${result.errors.join('; ')}`);
    }
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