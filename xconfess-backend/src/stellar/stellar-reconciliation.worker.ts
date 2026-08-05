import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { StellarAnchor, AnchorStatus } from './entities/stellar-anchor.entity';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { decryptConfession } from '../utils/confession-encryption';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface ReconciliationConfig {
  interval: string;
  minAgeMinutes: number;
  batchSize: number;
  maxRetries: number;
  backoffBaseMinutes: number;
}

@Injectable()
export class StellarReconciliationWorker {
  private readonly logger = new Logger(StellarReconciliationWorker.name);
  private readonly config: ReconciliationConfig;

  constructor(
    @InjectRepository(StellarAnchor)
    private readonly anchorRepository: Repository<StellarAnchor>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    private readonly stellarService: StellarService,
    private readonly contractService: ContractService,
    private readonly auditService: AuditLogService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const envInterval = process.env.STELLAR_RECONCILIATION_INTERVAL;
    this.config = {
      interval: (envInterval as CronExpression) || '*/15 * * * *',
      minAgeMinutes: parseInt(process.env.STELLAR_RECONCILIATION_MIN_AGE || '5', 10),
      batchSize: parseInt(process.env.STELLAR_RECONCILIATION_BATCH_SIZE || '50', 10),
      maxRetries: parseInt(process.env.STELLAR_RECONCILIATION_MAX_RETRIES || '5', 10),
      backoffBaseMinutes: parseInt(process.env.STELLAR_RECONCILIATION_BACKOFF_BASE || '2', 10),
    };
  }

  @Cron(process.env.STELLAR_RECONCILIATION_INTERVAL || '*/15 * * * *')
  async reconcilePendingAnchors() {
    const minAgeMs = this.config.minAgeMinutes * 60 * 1000;

    // Process both PENDING (initial anchoring) and OBSERVED (finality re-check)
    const anchors = await this.anchorRepository.find({
      where: [
        {
          status: AnchorStatus.PENDING,
          createdAt: LessThan(new Date(Date.now() - minAgeMs)),
        },
        {
          // Re-verify OBSERVED anchors: they have a tx hash but haven't reached
          // confirmed finality yet. They skip the retry-backoff check because
          // we want to re-verify them every reconciliation run until confirmed.
          status: AnchorStatus.OBSERVED,
        },
      ],
      take: this.config.batchSize,
      order: { createdAt: 'ASC' },
    });

    if (anchors.length === 0) return;

    this.logger.log(
      `Reconciling ${anchors.length} anchors ` +
        `(${anchors.filter((a) => a.status === AnchorStatus.PENDING).length} pending, ` +
        `${anchors.filter((a) => a.status === AnchorStatus.OBSERVED).length} observed) ` +
        `(batch size: ${this.config.batchSize})`,
    );

    let reconciled = 0;
    let failed = 0;
    let expired = 0;

    for (const anchor of anchors) {
      const result = await this.retryAnchor(anchor);
      if (result === 'anchored') reconciled++;
      else if (result === 'failed') failed++;
      else if (result === 'expired') expired++;
    }

    this.logger.log(
      `Reconciliation complete: ${reconciled} anchored, ${failed} failed, ${expired} expired`,
    );

    if (failed > 0 || expired > 0) {
      this.eventEmitter.emit('stellar.reconciliation.discrepancies', {
        reconciled,
        failed,
        expired,
        timestamp: new Date(),
      });
    }
  }

  private async retryAnchor(
    anchor: StellarAnchor,
  ): Promise<'anchored' | 'failed' | 'expired' | 'skipped'> {
    // For OBSERVED anchors, we re-verify finality immediately without backoff.
    if (anchor.status === AnchorStatus.PENDING) {
      const delay =
        Math.pow(2, anchor.retryCount) *
        this.config.backoffBaseMinutes *
        60 *
        1000;
      const timeSinceLastRetry =
        Date.now() -
        (anchor.lastRetryAt?.getTime() || anchor.createdAt.getTime());

      if (timeSinceLastRetry < delay) {
        return 'skipped';
      }
    }

    anchor.retryCount += 1;
    anchor.lastRetryAt = new Date();

    const requestId = randomUUID();

    try {
      this.logger.debug({
        event: 'stellar_anchor_retry',
        requestId,
        anchorId: anchor.id,
        confessionId: anchor.confessionId,
        txHash: anchor.stellarTxHash || undefined,
        status: anchor.status,
        attemptNumber: anchor.retryCount,
      });

      const confession = await this.confessionRepository.findOne({
        where: { id: anchor.confessionId },
      });
      if (!confession) {
        await this.auditService.log({
          actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
          metadata: {
            requestId,
            entityId: anchor.id,
            confessionId: anchor.confessionId,
            error: 'Confession not found',
            attempt_number: anchor.retryCount,
          },
        });
        anchor.status = AnchorStatus.FAILED;
        anchor.lastError = 'Confession not found';
        await this.anchorRepository.save(anchor);
        return 'failed';
      }

      // Check Stellar Horizon for existing transaction status
      if (anchor.stellarTxHash) {
        const txValid = await this.stellarService.verifyTransaction(
          anchor.stellarTxHash,
        );
        if (txValid) {
          if (anchor.status === AnchorStatus.OBSERVED) {
            // A successful transaction alone does not prove *this* confession
            // was anchored — the recorded tx hash could belong to an
            // unrelated or stale submission. Confirm the contract's on-chain
            // state actually holds the locally-computed hash before
            // graduating to the final ANCHORED status.
            const payloadMatches =
              !!confession.stellarHash &&
              (await this.contractService.verifyConfession(
                confession.stellarHash,
              )) !== null;

            if (!payloadMatches) {
              anchor.lastError =
                'Anchor hash mismatch: on-chain transaction does not anchor the expected confession hash';
              await this.anchorRepository.save(anchor);

              this.logger.warn({
                event: 'stellar_anchor_hash_mismatch',
                requestId,
                confessionId: anchor.confessionId,
                txHash: anchor.stellarTxHash,
                message: `Transaction ${anchor.stellarTxHash} succeeded on-chain but does not anchor the expected confession hash for confession ${anchor.confessionId}`,
              });
              return 'failed';
            }

            // Second verification confirmed: graduate from OBSERVED (provisional) -> ANCHORED (final)
            anchor.status = AnchorStatus.ANCHORED;
            anchor.observedAt = null;
            anchor.retryCount = 0;
            anchor.lastError = null;
            await this.anchorRepository.save(anchor);

            confession.isAnchored = true;
            confession.anchoredAt = new Date();
            await this.confessionRepository.save(confession);

            this.logger.log({
              event: 'stellar_anchor_confirmed',
              requestId,
              confessionId: anchor.confessionId,
              txHash: anchor.stellarTxHash,
              message: `Anchor finality confirmed via Horizon check for confession ${anchor.confessionId}`,
            });
            return 'anchored';
          } else {
            // First time observed on-chain: mark as OBSERVED (provisional status)
            anchor.status = AnchorStatus.OBSERVED;
            anchor.observedAt = new Date();
            await this.anchorRepository.save(anchor);

            this.logger.log({
              event: 'stellar_anchor_observed',
              requestId,
              confessionId: anchor.confessionId,
              txHash: anchor.stellarTxHash,
              message: `Anchor observed on-chain (provisional) for confession ${anchor.confessionId}`,
            });
            return 'anchored';
          }
        } else {
          // Transaction missing or disappeared (e.g. chain reorg)
          if (anchor.status === AnchorStatus.OBSERVED) {
            this.logger.warn({
              event: 'stellar_anchor_reorg_detected',
              requestId,
              confessionId: anchor.confessionId,
              txHash: anchor.stellarTxHash,
              message: `Observed transaction disappeared (reorg detected) for confession ${anchor.confessionId}`,
            });
            // Revert back to PENDING so it can be re-anchored
            anchor.status = AnchorStatus.PENDING;
            anchor.stellarTxHash = undefined as any;
            anchor.observedAt = null;
            await this.anchorRepository.save(anchor);
          }
        }
      }

      const aesKey = this.configService.get<string>(
        'app.confessionAesKey',
        '',
      );
      const decryptedMessage = decryptConfession(confession.message, aesKey);

      const timestamp = Date.now();
      const hash = this.stellarService.hashConfession(
        decryptedMessage,
        timestamp,
      );

      const serverSecret = this.configService.get<string>(
        'STELLAR_SERVER_SECRET',
      );
      if (!serverSecret) {
        throw new Error('Server secret key not configured');
      }

      const txResult = await this.contractService.anchorConfession(
        hash,
        timestamp,
        serverSecret,
      );

      // Transition to OBSERVED (provisional) state first
      anchor.status = AnchorStatus.OBSERVED;
      anchor.stellarTxHash = txResult.hash;
      anchor.observedAt = new Date();
      anchor.retryCount = 0;
      anchor.lastError = null;
      await this.anchorRepository.save(anchor);

      confession.stellarTxHash = txResult.hash;
      confession.stellarHash = hash;
      await this.confessionRepository.save(confession);

      this.logger.log({
        event: 'stellar_anchor_submitted',
        requestId,
        confessionId: anchor.confessionId,
        txHash: txResult.hash,
        message: `Successfully submitted anchor (provisional) for confession ${anchor.confessionId}`,
      });

      await this.auditService.log({
        actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
        metadata: {
          requestId,
          entityId: anchor.id,
          confessionId: anchor.confessionId,
          result: 'observed',
          txHash: txResult.hash,
          attempt_number: anchor.retryCount,
        },
      });

      return 'anchored';
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      anchor.lastError = errorMessage;

      this.logger.warn({
        event: 'stellar_anchor_retry_error',
        requestId,
        confessionId: anchor.confessionId,
        txHash: anchor.stellarTxHash || undefined,
        anchorId: anchor.id,
        attemptNumber: anchor.retryCount,
        error: errorMessage,
      });

      await this.auditService.log({
        actionType: AuditActionType.STELLAR_ANCHOR_RETRY,
        metadata: {
          requestId,
          entityId: anchor.id,
          confessionId: anchor.confessionId,
          error_message: errorMessage,
          attempt_number: anchor.retryCount,
        },
      });

      if (anchor.retryCount >= this.config.maxRetries) {
        anchor.status = AnchorStatus.FAILED;

        this.logger.error({
          event: 'stellar_anchor_failed',
          requestId,
          confessionId: anchor.confessionId,
          txHash: anchor.stellarTxHash || undefined,
          anchorId: anchor.id,
          attempts: anchor.retryCount,
        });

        await this.auditService.log({
          actionType: AuditActionType.STELLAR_ANCHOR_FAILED,
          metadata: {
            requestId,
            entityId: anchor.id,
            confessionId: anchor.confessionId,
            attempts: anchor.retryCount,
            last_error: errorMessage,
          },
        });

        await this.anchorRepository.save(anchor);
        return 'failed';
      }

      // Mark as expired if anchor is older than 24 hours and still pending
      const ageHours =
        (Date.now() - anchor.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        anchor.status = AnchorStatus.EXPIRED;
        await this.anchorRepository.save(anchor);

        await this.auditService.log({
          actionType: AuditActionType.STELLAR_ANCHOR_FAILED,
          metadata: {
            requestId,
            entityId: anchor.id,
            confessionId: anchor.confessionId,
            reason: 'expired',
            ageHours,
          },
        });

        this.logger.warn(
          `Anchor ${anchor.id} (confession: ${anchor.confessionId}) expired after ${ageHours.toFixed(1)} hours`,
        );
        return 'expired';
      }

      await this.anchorRepository.save(anchor);
      return 'failed';
    }
  }
}
