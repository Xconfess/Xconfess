import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { StellarService } from '../stellar/stellar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';

interface ReconciliationMetrics {
  totalPending: number;
  reconciled: number;
  confirmed: number;
  failed: number;
  stuck: number;
  lastRun: Date;
  duration: number;
  errors: string[];
}

interface DeadLetterRecord {
  tipId: string;
  txId: string;
  confessionId: string;
  lastError: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
}

/**
 * Chain Reconciliation Service
 * Issue #173: Continuously resolves pending anchor/tip records against authoritative chain state.
 *
 * This service:
 * - Runs on a schedule to check pending tips
 * - Updates tip status based on chain confirmation
 * - Implements exponential backoff for retries
 * - Tracks dead-letter (permanently stuck) records
 * - Emits structured logs and metrics
 */
@Injectable()
export class ChainReconciliationService {
  private readonly logger = new Logger(ChainReconciliationService.name);
  private readonly MAX_RETRY_ATTEMPTS = 10;
  private readonly INITIAL_BACKOFF_MS = 5000; // 5 seconds
  private readonly MAX_BACKOFF_MS = 3600000; // 1 hour
  private readonly STALE_THRESHOLD_MS = 86400000; // 24 hours
  private lastMetrics: ReconciliationMetrics | null = null;

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    private readonly stellarService: StellarService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get last reconciliation metrics
   */
  getLastMetrics(): ReconciliationMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Calculate exponential backoff with jitter
   * Issue #173: Bounded retries with backoff
   */
  private calculateBackoffMs(attemptNumber: number): number {
    const exponentialBackoff = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(2, attemptNumber - 1),
      this.MAX_BACKOFF_MS,
    );

    // Add jitter: ±20% of backoff time
    const jitter = exponentialBackoff * 0.2 * (Math.random() * 2 - 1);
    return Math.min(
      Math.max(exponentialBackoff + jitter, this.INITIAL_BACKOFF_MS),
      this.MAX_BACKOFF_MS,
    );
  }

  /**
   * Check if a pending tip should be retried
   */
  private shouldRetry(tip: Tip): boolean {
    if (!tip.lastCheckedAt) {
      return true; // Never checked, should retry
    }

    if (tip.retryCount >= this.MAX_RETRY_ATTEMPTS) {
      return false; // Max retries exceeded
    }

    const nextRetryTime = new Date(
      tip.lastCheckedAt.getTime() +
        this.calculateBackoffMs(tip.retryCount + 1),
    );

    return new Date() >= nextRetryTime;
  }

  /**
   * Create dead-letter record for permanently stuck tips
   * Issue #173: Dead-letter visibility for unresolved cases
   */
  private createDeadLetterRecord(
    tip: Tip,
    lastError: string,
  ): DeadLetterRecord {
    return {
      tipId: tip.id,
      txId: tip.txId,
      confessionId: tip.confessionId,
      lastError,
      attemptCount: tip.retryCount,
      firstFailedAt: tip.verificationStatus === TipVerificationStatus.PENDING
        ? tip.createdAt
        : tip.lastCheckedAt || tip.createdAt,
      lastFailedAt: new Date(),
    };
  }

  /**
   * Reconcile a single pending tip
   * Issue #173: Re-check chain status and progress records
   */
  private async reconcileSingleTip(tip: Tip): Promise<{
    success: boolean;
    newStatus?: TipVerificationStatus;
    error?: string;
  }> {
    try {
      // Verify transaction on-chain
      const txData = await this.stellarService.verifyTransactionFull(tip.txId);

      if (!txData || !txData.success) {
        // Transaction failed on-chain
        return {
          success: true,
          newStatus: TipVerificationStatus.REJECTED,
        };
      }

      // Transaction succeeded - mark as verified
      return {
        success: true,
        newStatus: TipVerificationStatus.VERIFIED,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if this is a transient or permanent error
      const isTransient =
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('rate limit');

      if (!isTransient && tip.retryCount >= this.MAX_RETRY_ATTEMPTS) {
        // Permanent failure after max retries
        return {
          success: false,
          error: `Reconciliation failed after ${tip.retryCount} attempts: ${errorMessage}`,
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Main reconciliation loop
   * Issue #173: Background reconciliation for pending anchor and tip verification records
   * Runs periodically to check stale pending records
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingTips(): Promise<void> {
    const startTime = Date.now();
    const metrics: ReconciliationMetrics = {
      totalPending: 0,
      reconciled: 0,
      confirmed: 0,
      failed: 0,
      stuck: 0,
      lastRun: new Date(),
      duration: 0,
      errors: [],
    };

    try {
      this.logger.log('Starting chain reconciliation for pending tips...');

      // Find all pending tips
      const pendingTips = await this.tipRepository.find({
        where: {
          verificationStatus: In([
            TipVerificationStatus.PENDING,
            TipVerificationStatus.STALE_PENDING,
          ]),
        },
        order: { lastCheckedAt: 'ASC' },
      });

      metrics.totalPending = pendingTips.length;

      if (pendingTips.length === 0) {
        this.logger.debug('No pending tips to reconcile');
        this.lastMetrics = {
          ...metrics,
          duration: Math.max(1, Date.now() - startTime),
        };
        return;
      }

      const deadLetters: DeadLetterRecord[] = [];

      for (const tip of pendingTips) {
        try {
          // Check if we should retry this tip
          if (!this.shouldRetry(tip)) {
            // Mark as stale if not yet marked
            if (
              tip.verificationStatus === TipVerificationStatus.PENDING &&
              tip.lastCheckedAt &&
              new Date().getTime() - tip.lastCheckedAt.getTime() >
                this.STALE_THRESHOLD_MS
            ) {
              await this.tipRepository.update(tip.id, {
                verificationStatus: TipVerificationStatus.STALE_PENDING,
              });
            }
            continue;
          }

          // Attempt reconciliation
          const reconcileResult = await this.reconcileSingleTip(tip);

          if (!reconcileResult.success && reconcileResult.error) {
            // Reconciliation failed, increment retry count
            await this.tipRepository.update(tip.id, {
              retryCount: tip.retryCount + 1,
              lastCheckedAt: new Date(),
              reconciliationMetadata: {
                ...tip.reconciliationMetadata,
                lastReconciliationAttempt: new Date().toISOString(),
                lastReconciliationError: reconcileResult.error,
                attemptCount: tip.retryCount + 1,
              } as Tip['reconciliationMetadata'],
            });

            // Check if this is now a dead-letter
            if (tip.retryCount + 1 >= this.MAX_RETRY_ATTEMPTS) {
              deadLetters.push(
                this.createDeadLetterRecord(tip, reconcileResult.error),
              );
              metrics.stuck++;

              this.logger.warn(
                `Tip ${tip.txId} marked as stuck after ${tip.retryCount + 1} failed reconciliation attempts`,
              );
            }

            metrics.failed++;
          } else if (reconcileResult.newStatus) {
            // Reconciliation succeeded, update status
            const newStatus = reconcileResult.newStatus;
            const wasStale =
              tip.verificationStatus === TipVerificationStatus.STALE_PENDING;

            await this.tipRepository.update(tip.id, {
              verificationStatus: newStatus,
              lastCheckedAt: new Date(),
              verifiedAt:
                newStatus === TipVerificationStatus.VERIFIED
                  ? new Date()
                  : null,
              reconciliationMetadata: {
                ...tip.reconciliationMetadata,
                lastReconciliationAttempt: new Date().toISOString(),
                finalizedStatus: newStatus,
                wasStale,
                reconciliationAttempts: tip.retryCount + 1,
              } as Tip['reconciliationMetadata'],
            });

            if (newStatus === TipVerificationStatus.VERIFIED) {
              metrics.confirmed++;
            }

            metrics.reconciled++;

            this.logger.debug(
              `Tip ${tip.txId} reconciled: ${tip.verificationStatus} → ${newStatus}`,
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          metrics.errors.push(
            `Error reconciling tip ${tip.txId}: ${errorMessage}`,
          );
          this.logger.error(
            `Failed to reconcile tip ${tip.txId}: ${errorMessage}`,
          );
        }
      }

      // Log dead-letter records to audit trail
      if (deadLetters.length > 0) {
        this.logger.warn(
          `Found ${deadLetters.length} stuck tips requiring operator intervention`,
        );

        for (const deadLetter of deadLetters) {
          await this.auditLogService.log({
            actionType: AuditActionType.TIP_RECONCILIATION_DEAD_LETTER,
            context: {
              userId: null,
              actor: {
                type: 'system',
                id: 'chain-reconciliation',
              },
            },
            metadata: {
              entityType: 'TIP',
              entityId: deadLetter.tipId,
              ...deadLetter,
              description: `Tip ${deadLetter.txId} stuck after ${deadLetter.attemptCount} reconciliation attempts: ${deadLetter.lastError}`,
            },
          });
        }
      }

      metrics.duration = Math.max(1, Date.now() - startTime);

      // Log reconciliation summary
      this.logger.log(
        `Chain reconciliation completed: ${metrics.reconciled}/${metrics.totalPending} reconciled ` +
          `(${metrics.confirmed} confirmed, ${metrics.failed} failed, ${metrics.stuck} stuck) ` +
          `in ${metrics.duration}ms`,
      );

      this.lastMetrics = metrics;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Chain reconciliation loop failed: ${errorMessage}`,
      );

      metrics.duration = Date.now() - startTime;
      metrics.errors.push(`Reconciliation loop error: ${errorMessage}`);
      this.lastMetrics = metrics;
    }
  }

  /**
   * Manual reconciliation trigger for operators
   * Can be called via HTTP endpoint or admin interface
   */
  async manualReconciliation(
    tipIds?: string[],
  ): Promise<ReconciliationMetrics> {
    const startTime = Date.now();

    try {
      const tips = tipIds
        ? await this.tipRepository.findByIds(tipIds)
        : await this.tipRepository.find({
            where: {
              verificationStatus: In([
                TipVerificationStatus.PENDING,
                TipVerificationStatus.STALE_PENDING,
              ]),
            },
          });

      const metrics: ReconciliationMetrics = {
        totalPending: tips.length,
        reconciled: 0,
        confirmed: 0,
        failed: 0,
        stuck: 0,
        lastRun: new Date(),
        duration: 0,
        errors: [],
      };

      for (const tip of tips) {
        const reconcileResult = await this.reconcileSingleTip(tip);

        if (reconcileResult.newStatus) {
          await this.tipRepository.update(tip.id, {
            verificationStatus: reconcileResult.newStatus,
            lastCheckedAt: new Date(),
            verifiedAt:
              reconcileResult.newStatus === TipVerificationStatus.VERIFIED
                ? new Date()
                : null,
          });

          metrics.reconciled++;

          if (reconcileResult.newStatus === TipVerificationStatus.VERIFIED) {
            metrics.confirmed++;
          }
        } else if (!reconcileResult.success) {
          metrics.failed++;
        }
      }

      metrics.duration = Date.now() - startTime;
      return metrics;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        totalPending: 0,
        reconciled: 0,
        confirmed: 0,
        failed: 0,
        stuck: 0,
        lastRun: new Date(),
        duration: Date.now() - startTime,
        errors: [errorMessage],
      };
    }
  }
}
