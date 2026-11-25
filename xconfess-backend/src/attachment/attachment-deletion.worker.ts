import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttachmentRepository } from './repository/attachment.repository';
import {
  ATTACHMENT_STORAGE,
  AttachmentStorage,
  ObjectNotFoundError,
} from './attachment-storage';

export const DEFAULT_DELETION_MAX_ATTEMPTS = 5;
export const DEFAULT_DELETION_BASE_DELAY_MS = 500;
export const DEFAULT_DELETION_MAX_DELAY_MS = 10_000;
export const DEFAULT_DELETION_SWEEP_LIMIT = 100;

export type AttachmentDeletionOutcome =
  /** Object (if any) and row are gone. */
  | 'deleted'
  /** Row was already gone before we started: nothing to do. */
  | 'already_deleted'
  /** A confession/message still references it; storage was NOT touched. */
  | 'skipped_referenced'
  /** Retries exhausted; row stays ABANDONED and is picked up by the next sweep. */
  | 'failed';

export interface AttachmentDeletionResult {
  attachmentId: string;
  outcome: AttachmentDeletionOutcome;
  attempts: number;
  /** Safe summary of the last failure (never contains the object key). */
  error?: string;
}

export interface DeletionSweepResult {
  scanned: number;
  deleted: number;
  alreadyDeleted: number;
  skippedReferenced: number;
  failed: number;
}

/**
 * Idempotent attachment deletion worker.
 *
 * Safety properties:
 * - Deleting an object that is already gone counts as success (backends may
 *   throw ObjectNotFoundError or resolve silently).
 * - Database references are checked, and the row is atomically claimed as
 *   ABANDONED only while unreferenced, BEFORE any storage deletion; the
 *   references are re-checked by the final conditional row delete.
 * - Order is claim -> storage delete -> row delete. If anything fails midway
 *   the row remains ABANDONED, so a retry (or a restarted worker's next
 *   sweep) resumes exactly where it stopped. The row is never removed while
 *   its object might still exist.
 * - Objects shared by another live row (same objectKey) are never deleted.
 * - Failures are retried with bounded exponential backoff.
 */
@Injectable()
export class AttachmentDeletionWorker {
  private readonly logger = new Logger(AttachmentDeletionWorker.name);
  private sweeping = false;

  /** Replaceable in tests so backoff does not slow the suite. */
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
    private readonly configService: ConfigService,
  ) {}

  private num(key: string, fallback: number): number {
    const raw = this.configService.get<number | string>(key);
    const value = typeof raw === 'string' ? Number(raw) : raw;
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }

  get maxAttempts(): number {
    return this.num(
      'ATTACHMENT_DELETION_MAX_ATTEMPTS',
      DEFAULT_DELETION_MAX_ATTEMPTS,
    );
  }

  /** Delay before retry number `attempt` (1-based): base * 2^(attempt-1), capped. */
  backoffDelayMs(attempt: number): number {
    const base = this.num(
      'ATTACHMENT_DELETION_BASE_DELAY_MS',
      DEFAULT_DELETION_BASE_DELAY_MS,
    );
    const max = this.num(
      'ATTACHMENT_DELETION_MAX_DELAY_MS',
      DEFAULT_DELETION_MAX_DELAY_MS,
    );
    return Math.min(base * 2 ** Math.max(attempt - 1, 0), max);
  }

  /** Delete one attachment, retrying transient failures with bounded backoff. */
  async deleteWithRetry(
    attachmentId: string,
  ): Promise<AttachmentDeletionResult> {
    const maxAttempts = this.maxAttempts;
    let lastError = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const outcome = await this.deleteOnce(attachmentId);
        return { attachmentId, outcome, attempts: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error.name : 'UnknownError';
        this.logger.warn(
          `Attachment ${attachmentId} deletion attempt ${attempt}/${maxAttempts} failed (${lastError})`,
        );
        if (attempt < maxAttempts) {
          await this.sleep(this.backoffDelayMs(attempt));
        }
      }
    }

    return {
      attachmentId,
      outcome: 'failed',
      attempts: maxAttempts,
      error: lastError,
    };
  }

  /** One idempotent pass. Throws on failure so the caller can retry. */
  async deleteOnce(
    attachmentId: string,
  ): Promise<Exclude<AttachmentDeletionOutcome, 'failed'>> {
    const attachment = await this.attachmentRepository.findById(attachmentId);
    if (!attachment) return 'already_deleted';

    // 1. Reference check + atomic claim, before any storage call.
    const claimed =
      await this.attachmentRepository.claimUnreferencedForDeletion(
        attachmentId,
      );
    if (!claimed) return 'skipped_referenced';

    // 2. Storage deletion, unless another live row still needs the object.
    const sharedByOthers =
      await this.attachmentRepository.countOtherLiveRowsForObjectKey(
        attachment.objectKey,
        attachmentId,
      );
    if (sharedByOthers === 0) {
      try {
        await this.storage.deleteObject(attachment.objectKey);
      } catch (error) {
        // Already removed (earlier attempt, other worker, manual cleanup).
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
    }

    // 3. Remove the row last. Conditional: re-checks references and status.
    const removed =
      await this.attachmentRepository.deleteClaimedIfUnreferenced(attachmentId);
    if (removed === 0) {
      const current = await this.attachmentRepository.findById(attachmentId);
      if (!current) return 'deleted'; // a concurrent worker finished it
      if (await this.attachmentRepository.isReferenced(attachmentId)) {
        return 'skipped_referenced';
      }
      throw new Error('Row delete had no effect; will retry');
    }
    return 'deleted';
  }

  /**
   * Process rows left ABANDONED (new work, or work interrupted by a failure
   * or restart). Safe to run concurrently and repeatedly.
   */
  async processPending(
    limit: number = this.num(
      'ATTACHMENT_DELETION_SWEEP_LIMIT',
      DEFAULT_DELETION_SWEEP_LIMIT,
    ),
  ): Promise<DeletionSweepResult> {
    const result: DeletionSweepResult = {
      scanned: 0,
      deleted: 0,
      alreadyDeleted: 0,
      skippedReferenced: 0,
      failed: 0,
    };

    const pending =
      await this.attachmentRepository.findAbandonedForDeletion(limit);
    result.scanned = pending.length;

    for (const attachment of pending) {
      const outcome = await this.deleteWithRetry(attachment.id);
      switch (outcome.outcome) {
        case 'deleted':
          result.deleted += 1;
          break;
        case 'already_deleted':
          result.alreadyDeleted += 1;
          break;
        case 'skipped_referenced':
          result.skippedReferenced += 1;
          break;
        default:
          result.failed += 1;
      }
    }
    return result;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledSweep(): Promise<void> {
    if (this.sweeping) return; // no overlapping sweeps in one process
    this.sweeping = true;
    try {
      const result = await this.processPending();
      if (result.scanned > 0) {
        this.logger.log(
          `Attachment deletion sweep: scanned=${result.scanned} deleted=${result.deleted} skippedReferenced=${result.skippedReferenced} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Attachment deletion sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }
}
