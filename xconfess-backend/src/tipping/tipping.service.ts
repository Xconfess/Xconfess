import {
  Injectable,
  NotFoundException,
  BadRequestException,
  GatewayTimeoutException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { VerifyTipDto } from './dto/verify-tip.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import * as crypto from 'crypto';
import { AnalyticsEventService } from '../analytics/analytics-event.service';
import { AnalyticsNetwork } from '../analytics/entities/analytics-event.entity';
import { ErrorUtils } from '../common/errors/error-utils';
import { StellarAddressValidator } from '../stellar/validators/stellar-address.validator';
import {
  backOffOrFailTransient,
  isTransientRpcError,
  StellarRpcUnavailableException,
} from '../stellar/utils/rpc-rate-limit';
import {
  MAX_TIP_AMOUNT,
  MIN_TIP_AMOUNT,
  TIP_PRECISION,
  SUPPORTED_TIP_ASSETS,
  DEFAULT_TIP_ASSET,
  validateTipAsset,
  validateTipPrecision,
  validateTipAmountBounds,
} from './tipping.constants';

export interface TipStats {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
}

/**
 * Canonical, typed outcome of a verify request (issue #1687).
 *
 * - `verified`  — this request performed first-writer settlement.
 * - `duplicate` — a prior request already settled this exact (confession, tx)
 *                 pair; this is a safe, canonical replay, not an error.
 * - `pending`   — another request is actively settling this pair right now.
 * - `stale`     — verification has exceeded the SLA threshold and is under
 *                 reconciliation review; not a terminal failure.
 * - `failed`    — verification failed terminally (invalid tx, bad amount,
 *                 not found on chain) or hit a transient/retryable error.
 * - `conflict`  — the transaction ID is already bound to a different
 *                 confession, or a reconciliation pass flagged a conflict.
 */
export type TipResponseState =
  | 'verified'
  | 'duplicate'
  | 'pending'
  | 'stale'
  | 'failed'
  | 'conflict';

export interface TipVerificationResult {
  tip: Tip;
  isNew: boolean;
  isIdempotent: boolean;
  state: TipResponseState;
  conflictDetails?: {
    reason: 'DIFFERENT_CONFESSION' | 'ALREADY_PROCESSING' | 'ALREADY_VERIFIED';
    originalConfessionId?: string;
    requestId?: string;
  };
}

interface IdempotencyRecord {
  key: string;
  txId: string;
  confessionId: string;
  operation: 'verify_tip';
  caller: string;
  expiresAt: number;
}

interface SettlementReceiptMetadata {
  settlementId: string | null;
  proofMetadata: string | null;
  anonymousSender: boolean;
}

interface ProcessedTransactionData {
  amount: number;
  senderAddress: string | null;
  receiptMetadata: SettlementReceiptMetadata;
}

// PostgreSQL unique-violation error code
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Tip amount bounds — must be consistent with contract and frontend.
 * - MIN_TIP_AMOUNT: 0.1 XLM (minimum viable tip)
 * - MAX_TIP_AMOUNT: 10,000 XLM (upper bound to prevent overflow and abuse)
 * - TIP_PRECISION: 7 decimal places (Stellar's native precision for assets)
 */
@Injectable()
export class TippingService {
  private static readonly MAX_RECEIPT_PROOF_METADATA_LEN = 128;
  private static readonly LOCK_TIMEOUT_MS = 30_000; // 30 seconds
  private static readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly IDEMPOTENCY_MAX_KEYS = 10_000;
  private readonly logger = new Logger(TippingService.name);
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    private readonly stellarService: StellarService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogService: AuditLogService,
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    private readonly analyticsEventService?: AnalyticsEventService,
    @Optional()
    private readonly stellarAddressValidator?: StellarAddressValidator,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get all tips for a confession
   */
  async getTipsByConfessionId(confessionId: string): Promise<Tip[]> {
    return this.tipRepository.find({
      where: { confessionId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get tipping statistics for a confession
   */
  async getTipStats(confessionId: string): Promise<TipStats> {
    const tips = await this.tipRepository.find({
      where: { confessionId },
    });

    const totalAmount = tips.reduce((sum, tip) => sum + Number(tip.amount), 0);
    const totalCount = tips.length;
    const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    return {
      totalAmount,
      totalCount,
      averageAmount,
    };
  }

  /**
   * Get tip by transaction ID
   */
  async getTipByTxId(txId: string): Promise<Tip | null> {
    return this.tipRepository.findOne({
      where: { txId },
      relations: ['confession'],
    });
  }

  /**
   * Public-safe tip status lookup scoped to a confession.
   * Distinguishes pending/confirmed/failed lifecycle states and does not expose
   * internal reconciliation/lock metadata or unrelated account data.
   */
  async getTipStatusForConfession(
    confessionId: string,
    txId: string,
  ): Promise<{
    confessionId: string;
    txId: string;
    tipId: string;
    lifecycleStatus: 'pending' | 'confirmed' | 'failed';
    verificationStatus: TipVerificationStatus;
    amount: number;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAtHint: Date | null;
  }> {
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
    });
    if (!confession) {
      throw new NotFoundException(
        `Confession with ID ${confessionId} not found`,
      );
    }

    const normalizedTxId = txId?.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(normalizedTxId ?? '')) {
      throw new BadRequestException({
        message: 'Invalid transaction ID format.',
        code: 'VALIDATION_FAILED',
        details: { field: 'txId' },
      });
    }

    const tip = await this.tipRepository.findOne({
      where: { txId: normalizedTxId, confessionId },
    });

    if (!tip) {
      throw new NotFoundException(`Tip transaction ${normalizedTxId} not found`);
    }

    const lifecycleStatus = this.toPublicLifecycleStatus(tip.verificationStatus);
    return {
      confessionId: tip.confessionId,
      txId: tip.txId,
      tipId: tip.id,
      lifecycleStatus,
      verificationStatus: tip.verificationStatus,
      amount: Number(tip.amount),
      verifiedAt: tip.verifiedAt ?? null,
      createdAt: tip.createdAt,
      updatedAtHint: tip.verifiedAt ?? tip.lastCheckedAt ?? tip.createdAt ?? null,
    };
  }

  private toPublicLifecycleStatus(
    status: TipVerificationStatus,
  ): 'pending' | 'confirmed' | 'failed' {
    if (status === TipVerificationStatus.VERIFIED) return 'confirmed';
    if (
      status === TipVerificationStatus.PENDING ||
      status === TipVerificationStatus.STALE_PENDING
    ) {
      return 'pending';
    }
    return 'failed';
  }

  /**
   * Verify a Stellar tip transaction and record exactly one credit.
   *
   * Double-credit prevention strategy (issue #1480):
   *
   * 1. **Idempotency key** = SHA256(confessionId:txId) is computed deterministically
   *    for every request.
   *
   * 2. **Atomic sentinel INSERT** — inside a serialisable transaction we attempt to
   *    INSERT a PENDING tip row with the idempotency_key.  The DB-level UNIQUE
   *    constraint on `tips.idempotency_key` guarantees that even if 100 concurrent
   *    requests race past any in-memory check, only ONE will succeed in creating
   *    the row.  All others catch PG error 23505 (unique_violation) and branch
   *    to the idempotent-replay path immediately — no double-credit is possible.
   *
   * 3. **Processing lock** — the winning INSERT also sets `processing_lock` so that
   *    the background reconciliation worker cannot race the in-flight HTTP handler.
   *
   * 4. **Audit log emitted once** — `TIP_SETTLEMENT_VERIFIED` is written only on
   *    the code path that created the sentinel row (isNew = true), so aggregate
   *    totals in the audit trail are always accurate regardless of how many
   *    concurrent verify calls arrive for the same transaction.
   *
   * Issues: #1480, #170, #784, #777
   */
  async verifyAndRecordTip(
    confessionId: string,
    dto: VerifyTipDto,
    requestId?: string,
    callerContext?: { ip?: string | null },
  ): Promise<TipVerificationResult> {
    this.logger.log({
      message: 'Tip verify started',
      requestId,
      confessionId,
      txHash: dto.txId,
    });

    // ── 1. Confession must exist ──────────────────────────────────────────
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
    });

    if (!confession) {
      this.logger.warn({
        message: 'Confession not found',
        requestId,
        confessionId,
        txHash: dto.txId,
      });
      throw new NotFoundException(
        `Confession with ID ${confessionId} not found`,
      );
    }

    this.assertIdempotencyKeyBinding(confessionId, dto, requestId, callerContext);

    // ── 2. Derive idempotency key ────────────────────────────────────────
    const idempotencyKey = this.generateIdempotencyKey(confessionId, dto.txId);
    const existingByIdempotencyKey =
      await this.findTipByIdempotencyKey(idempotencyKey);
    if (existingByIdempotencyKey) {
      if (
        existingByIdempotencyKey.confessionId === confessionId &&
        existingByIdempotencyKey.txId === dto.txId
      ) {
        this.logger.debug({
          message: 'Idempotent replay detected',
          requestId,
          confessionId,
          txHash: dto.txId,
          tipId: existingByIdempotencyKey.id,
          status: existingByIdempotencyKey.verificationStatus,
        });
        return this.resolveIdempotentOutcome(existingByIdempotencyKey);
      }

      this.logger.warn({
        message: 'Idempotency key lookup returned a row that does not match the request payload',
        requestId,
        confessionId,
        txHash: dto.txId,
        tipId: existingByIdempotencyKey.id,
        originalConfessionId: existingByIdempotencyKey.confessionId,
      });
    }

    // ── 3. Atomic sentinel INSERT — the single-credit gate ───────────────
    //
    // We try to INSERT a PENDING row with the idempotency_key.  The DB UNIQUE
    // constraint means only one concurrent caller can win this race.
    //
    //  • INSERT succeeds   → this caller owns the work; proceed to chain verify.
    //  • INSERT fails 23505 → another caller (or a prior completed request)
    //                         already holds this key; return canonical replay.
    const { isFirstWriter, sentinelTip } =
      await this.tryInsertSentinelTip(confessionId, dto.txId, idempotencyKey);

    if (!isFirstWriter) {
      // Another request already settled (or is settling) this (confession, tx).
      // Re-read the latest state to return the canonical response.
      const canonical = await this.findTipByIdempotencyKey(idempotencyKey);

      if (!canonical) {
        // Extremely unlikely — row was deleted between our INSERT failure and
        // this read.  Let the caller retry.
        throw ErrorUtils.operationConflict('tip', 'ALREADY_PROCESSING', {
          message: `Transaction ${dto.txId} is currently being processed. Please retry in a moment.`,
          state: 'pending' as TipResponseState,
          canRetry: true,
          retryAfter: 2,
        });
      }

      this.logger.debug({
        message: 'Idempotent replay detected',
        requestId,
        confessionId,
        txHash: dto.txId,
        tipId: canonical.id,
        status: canonical.verificationStatus,
      });

      return this.resolveIdempotentOutcome(canonical);
    }

    // ── 4. Guard: txId must not be bound to a different confession ────────
    //
    // With the sentinel inserted we now own the (confessionId, txId) slot.
    // Still check that the raw txId wasn't already finalised for a *different*
    // confession via an older tip row (which would have a different key).
    const tipByTxId = await this.tipRepository.findOne({
      where: { txId: dto.txId },
    });

    if (tipByTxId && tipByTxId.confessionId !== confessionId) {
      // Roll back our sentinel and surface the conflict.
      await this.tipRepository.delete({ id: sentinelTip.id });

      this.logger.warn({
        message: 'Conflict: txId already used for a different confession',
        requestId,
        confessionId,
        txHash: dto.txId,
        originalConfessionId: tipByTxId.confessionId,
      });

      throw ErrorUtils.operationConflict('tip', 'DIFFERENT_CONFESSION', {
        message: `Transaction ${dto.txId} was already used for a different confession`,
        state: 'conflict' as TipResponseState,
        canRetry: false,
        details: { originalConfessionId: tipByTxId.confessionId },
      });
    }

    // ── 5. On-chain verification ──────────────────────────────────────────
    try {
      let isValid = false;
      try {
        isValid = await this.stellarService.verifyTransaction(
          dto.txId,
          requestId,
        );
      } catch (verifyError: any) {
        if (verifyError instanceof StellarRpcUnavailableException) {
          await this.updateRetryMetadata(sentinelTip.id, 'rpc_unavailable', {
            error: verifyError.message,
            attemptedAt: new Date().toISOString(),
          });
          await this.releaseProcessingLock(sentinelTip.id);
          throw verifyError;
        }

        this.logger.warn({
          message: 'Network error verifying transaction, marking for retry',
          requestId,
          confessionId,
          txHash: dto.txId,
          error: verifyError.message,
        });
        await this.updateRetryMetadata(sentinelTip.id, 'network_error', {
          error: verifyError.message,
          attemptedAt: new Date().toISOString(),
        });
        await this.releaseProcessingLock(sentinelTip.id);
        throw ErrorUtils.operationConflict('tip', 'NETWORK_ERROR', {
          message: `Transaction ${dto.txId} verification temporarily failed due to network error. Will be retried.`,
          state: 'failed' as TipResponseState,
          canRetry: true,
          retryAfter: 5,
        });
      }

      if (!isValid) {
        this.logger.warn({
          message: 'Transaction not found or invalid on Stellar network',
          requestId,
          confessionId,
          txHash: dto.txId,
        });
        await this.updateRetryMetadata(sentinelTip.id, 'not_found', {
          error: 'Transaction not found on chain',
          attemptedAt: new Date().toISOString(),
        });
        await this.releaseProcessingLock(sentinelTip.id);
        throw new BadRequestException(
          'Transaction not found or invalid on Stellar network',
        );
      }

      // ── 6. Fetch Horizon data ─────────────────────────────────────────
      let txData: any;
      try {
        txData = await this.fetchTransactionData(dto.txId);
      } catch (fetchError: any) {
        if (fetchError instanceof StellarRpcUnavailableException) {
          await this.updateRetryMetadata(sentinelTip.id, 'rpc_unavailable', {
            error: fetchError.message,
            attemptedAt: new Date().toISOString(),
          });
          await this.releaseProcessingLock(sentinelTip.id);
          throw fetchError;
        }

        if (fetchError instanceof GatewayTimeoutException) {
          await this.updateRetryMetadata(sentinelTip.id, 'fetch_retryable', {
            error: fetchError.message,
            attemptedAt: new Date().toISOString(),
          });
          await this.releaseProcessingLock(sentinelTip.id);
          throw ErrorUtils.operationConflict('tip', 'NETWORK_ERROR', {
            message: `Transaction ${dto.txId} data fetch failed temporarily. Will be retried.`,
            state: 'failed' as TipResponseState,
            canRetry: true,
            retryAfter: 5,
          });
        }
        throw fetchError;
      }

      const processedData = await this.processTransactionData(txData, dto.txId);

      // ── 8. Finalise the sentinel row as VERIFIED (single write) ────────
      const reconciliationMetadata = {
        verifiedBy: 'user_request',
        processedData: {
          amount: processedData.amount,
          senderAddress: processedData.senderAddress,
        },
        receiptMetadata: processedData.receiptMetadata,
        idempotencyKey,
        requestId: requestId ?? null,
      };

      sentinelTip.amount = processedData.amount;
      sentinelTip.senderAddress = processedData.senderAddress;
      sentinelTip.verificationStatus = TipVerificationStatus.VERIFIED;
      sentinelTip.verifiedAt = new Date();
      sentinelTip.lastChainStatus = 'verified';
      sentinelTip.lastCheckedAt = new Date();
      sentinelTip.reconciliationMetadata = reconciliationMetadata;
      sentinelTip.processingLock = null;
      sentinelTip.lockedAt = null;
      sentinelTip.lockedBy = null;

      const savedTip = await this.tipRepository.save(sentinelTip);
      const amountAtomic = Math.round(
        processedData.amount * 10_000_000,
      ).toString();
      const network = this.getAnalyticsNetwork();

      this.analyticsEventService
        ?.record({
          eventName: 'tip_completed',
          txHash: dto.txId,
          assetCode: 'XLM',
          amountAtomic,
          network,
          idempotencyKey: `tip_completed:${dto.txId}`,
          metadata: {
            source: 'tipping_service',
            tipId: savedTip.id,
            confessionId,
            requestId: requestId ?? null,
          },
        })
        .catch((err) =>
          this.logger.warn({
            message: 'Failed to record tip analytics',
            requestId,
            confessionId,
            txHash: dto.txId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      this.analyticsEventService
        ?.record({
          eventName: 'stellar_tx_confirmed',
          txHash: dto.txId,
          assetCode: 'XLM',
          amountAtomic,
          network,
          idempotencyKey: `stellar_tx_confirmed:${dto.txId}`,
          metadata: { source: 'tipping_service', requestId: requestId ?? null },
        })
        .catch((err) =>
          this.logger.warn({
            message: 'Failed to record Stellar confirmation analytics',
            requestId,
            txHash: dto.txId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );

      // ── 9. Post-success side-effects (emitted exactly once) ───────────

      // Domain event for downstream listeners
      this.eventEmitter.emit('tip.verified', {
        tipId: savedTip.id,
        confessionId,
        txId: dto.txId,
        amount: processedData.amount,
        requestId,
      });

      // Audit log — one settlement event per unique (confession, tx) pair.
      // Because only the first-writer reaches this code path, concurrent
      // duplicates never emit a second event.
      await this.auditLogService.log({
        actionType: AuditActionType.TIP_SETTLEMENT_VERIFIED,
        metadata: {
          entityType: 'tip',
          entityId: savedTip.id,
          tipId: savedTip.id,
          confessionId,
          txId: dto.txId,
          amount: processedData.amount,
          idempotencyKey,
          requestId: requestId ?? null,
          settledAt: savedTip.verifiedAt?.toISOString(),
        },
        context: {
          actor: { type: 'system', id: 'tipping-service' },
          requestId,
        },
      });

      this.logger.log({
        message: 'Tip verify succeeded',
        requestId,
        confessionId,
        txHash: dto.txId,
        tipId: savedTip.id,
        amount: processedData.amount,
        isNew: true,
      });

      return { tip: savedTip, isNew: true, isIdempotent: false, state: 'verified' };
    } catch (error) {
      // Best-effort: release the processing lock so the reconciler can retry.
      // If the sentinel row itself is the problem (e.g. amount/fetch error),
      // we leave it as PENDING so the cron worker can reconcile it later.
      // We intentionally do NOT delete the sentinel here so the UNIQUE index
      // continues to block any further concurrent first-writer attempts.
      try {
        await this.releaseProcessingLock(sentinelTip.id);
      } catch {
        // ignore secondary error
      }

      this.eventEmitter.emit('tip.verification_failed', {
        confessionId,
        txId: dto.txId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.analyticsEventService
        ?.record({
          eventName: 'stellar_tx_failed',
          txHash: dto.txId,
          network: this.getAnalyticsNetwork(),
          idempotencyKey: `stellar_tx_failed:${dto.txId}`,
          metadata: {
            source: 'tipping_service',
            state: 'failed',
            requestId: requestId ?? null,
          },
        })
        .catch(() => undefined);

      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generate idempotency key: SHA256(confessionId:txHash).
   * Deterministic — same inputs always produce the same key.
   */
  private generateIdempotencyKey(confessionId: string, txHash: string): string {
    return crypto
      .createHash('sha256')
      .update(`${confessionId}:${txHash}`)
      .digest('hex');
  }

  private getAnalyticsNetwork(): AnalyticsNetwork {
    return this.configService?.get<string>('STELLAR_NETWORK') === 'mainnet'
      ? 'mainnet'
      : 'testnet';
  }

  private normalizeSenderAddress(raw: string | null): string | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;

    const validator = this.stellarAddressValidator;
    if (validator) {
      try {
        if (trimmed.startsWith('M')) {
          return validator.validateMuxedAddress(trimmed);
        }
        return validator.validateAccountId(trimmed, 'sender address');
      } catch {
        throw new BadRequestException({
          message: 'Invalid sender address in transaction payload.',
          code: 'INVALID_STELLAR_ADDRESS',
          state: 'failed' as TipResponseState,
          details: { field: 'senderAddress' },
          canRetry: false,
        });
      }
    }

    // Fallback when validator is not injected (tests/legacy wiring).
    const isG = /^G[A-Z2-7]{55}$/.test(trimmed);
    const isM = /^M[A-Z2-7]{68}$/.test(trimmed);
    if (!isG && !isM) {
      throw new BadRequestException({
        message: 'Invalid sender address in transaction payload.',
        code: 'INVALID_STELLAR_ADDRESS',
        state: 'failed' as TipResponseState,
        details: { field: 'senderAddress' },
        canRetry: false,
      });
    }
    return trimmed;
  }

  private async findTipByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<Tip | null> {
    return this.tipRepository.findOne({ where: { idempotencyKey } });
  }

  private getIdempotencyCaller(callerContext?: { ip?: string | null }): string {
    const ip = callerContext?.ip?.trim();
    return ip && ip.length > 0 ? `ip:${ip}` : 'ip:unknown';
  }

  private getIdempotencyScope(confessionId: string): string {
    return `verify_tip:${confessionId}`;
  }

  private getIdempotencyStoreKey(caller: string, confessionId: string, key: string): string {
    return `${caller}::${this.getIdempotencyScope(confessionId)}::${key}`;
  }

  private pruneIdempotencyRecords(now = Date.now()): void {
    for (const [storeKey, record] of this.idempotencyRecords.entries()) {
      if (record.expiresAt <= now) {
        this.idempotencyRecords.delete(storeKey);
      }
    }

    if (this.idempotencyRecords.size <= TippingService.IDEMPOTENCY_MAX_KEYS) {
      return;
    }

    const overflow =
      this.idempotencyRecords.size - TippingService.IDEMPOTENCY_MAX_KEYS;
    let removed = 0;
    for (const storeKey of this.idempotencyRecords.keys()) {
      this.idempotencyRecords.delete(storeKey);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  private assertIdempotencyKeyBinding(
    confessionId: string,
    dto: VerifyTipDto,
    requestId?: string,
    callerContext?: { ip?: string | null },
  ): void {
    const key = dto.idempotencyKey?.trim();
    if (!key) return;

    const now = Date.now();
    this.pruneIdempotencyRecords(now);

    const caller = this.getIdempotencyCaller(callerContext);
    const storeKey = this.getIdempotencyStoreKey(caller, confessionId, key);
    const existing = this.idempotencyRecords.get(storeKey);

    if (existing) {
      if (existing.expiresAt <= now) {
        this.idempotencyRecords.delete(storeKey);
      } else if (
        existing.txId !== dto.txId ||
        existing.confessionId !== confessionId ||
        existing.operation !== 'verify_tip' ||
        existing.caller !== caller
      ) {
        this.logger.warn({
          message: 'Idempotency key replay rejected due to payload/caller mismatch',
          requestId,
          confessionId,
          txHash: dto.txId,
        });
        throw ErrorUtils.operationConflict('tip', 'IDEMPOTENCY_KEY_CONFLICT', {
          message:
            'Idempotency key has already been used for a different tipping request.',
          state: 'conflict' as TipResponseState,
          canRetry: false,
          retryWith: 'a new idempotency key',
          details: { field: 'idempotencyKey' },
        });
      } else {
        existing.expiresAt = now + TippingService.IDEMPOTENCY_TTL_MS;
        this.idempotencyRecords.delete(storeKey);
        this.idempotencyRecords.set(storeKey, existing);
        return;
      }
    }

    this.idempotencyRecords.set(storeKey, {
      key,
      txId: dto.txId,
      confessionId,
      operation: 'verify_tip',
      caller,
      expiresAt: now + TippingService.IDEMPOTENCY_TTL_MS,
    });
  }

  /**
   * Given an existing tip row that matches the (confession, tx) idempotency
   * key, decide the safe, typed outcome to hand back to the caller. This is
   * the single place that maps a replayed row's *real* status onto a typed
   * response — earlier code returned a blanket success for any matching row,
   * which could mask a stale, rejected, or conflicted tip as "verified".
   * Issue #1687.
   */
  private resolveIdempotentOutcome(tip: Tip): TipVerificationResult {
    switch (tip.verificationStatus) {
      case TipVerificationStatus.VERIFIED:
        return { tip, isNew: false, isIdempotent: true, state: 'duplicate' };

      case TipVerificationStatus.PENDING:
        throw ErrorUtils.operationConflict('tip', 'ALREADY_PROCESSING', {
          message: `Transaction ${tip.txId} is currently being processed. Please retry in a moment.`,
          state: 'pending' as TipResponseState,
          canRetry: true,
          retryAfter: 2,
        });

      case TipVerificationStatus.STALE_PENDING:
        throw ErrorUtils.operationConflict('tip', 'STALE_PENDING', {
          message: `Transaction ${tip.txId} verification has exceeded the expected processing time and is under review. It has not failed — check back shortly or contact support with this reference.`,
          state: 'stale' as TipResponseState,
          canRetry: true,
          retryAfter: 30,
        });

      case TipVerificationStatus.REJECTED:
        throw new BadRequestException({
          message: `Transaction ${tip.txId} could not be verified for this confession.`,
          state: 'failed' as TipResponseState,
          canRetry: false,
        });

      case TipVerificationStatus.CONFLICT:
      default:
        throw ErrorUtils.operationConflict('tip', 'DIFFERENT_CONFESSION', {
          message: `Transaction ${tip.txId} could not be processed due to a conflicting prior record.`,
          state: 'conflict' as TipResponseState,
          canRetry: false,
        });
    }
  }

  /**
   * Atomically insert a PENDING sentinel tip row.
   *
   * The UNIQUE constraint on `idempotency_key` ensures exactly one caller
   * wins the race; all others receive PG error 23505 and are directed to
   * the idempotent-replay path.
   *
   * Returns:
   *  - `isFirstWriter: true`  → this caller created the row, proceed with work.
   *  - `isFirstWriter: false` → another caller already holds the key, replay.
   */
  private async tryInsertSentinelTip(
    confessionId: string,
    txId: string,
    idempotencyKey: string,
  ): Promise<{ isFirstWriter: boolean; sentinelTip: Tip }> {
    const lockId = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    try {
      const sentinel = this.tipRepository.create({
        confessionId,
        txId,
        idempotencyKey,
        amount: 0, // placeholder; overwritten on finalise
        verificationStatus: TipVerificationStatus.PENDING,
        processingLock: lockId,
        lockedAt: now,
        lockedBy: 'verify',
        retryCount: 0,
        lastCheckedAt: now,
      });

      const saved = await this.tipRepository.save(sentinel);
      return { isFirstWriter: true, sentinelTip: saved };
    } catch (err: any) {
      // PG unique_violation — another process owns this idempotency key.
      if (
        err instanceof QueryFailedError &&
        (err as any).code === PG_UNIQUE_VIOLATION
      ) {
        // Return a dummy sentinel; the caller will re-read the real row.
        const dummy = new Tip();
        dummy.idempotencyKey = idempotencyKey;
        return { isFirstWriter: false, sentinelTip: dummy };
      }
      throw err;
    }
  }

  /**
   * Release the processing lock on a tip row identified by its PK.
   * Uses the row ID (not txId) to avoid a table scan.
   */
  private async releaseProcessingLock(tipId: string): Promise<void> {
    await this.tipRepository.update(tipId, {
      processingLock: null,
      lockedAt: null,
      lockedBy: null,
    });
  }

  /**
   * Persist retry/chain metadata for a pending tip identified by its PK.
   * Issue #777: Persist retry metadata for debugging and reconciliation.
   */
  private async updateRetryMetadata(
    tipId: string,
    chainStatus: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.tipRepository
      .createQueryBuilder()
      .update(Tip)
      .set({
        lastChainStatus: chainStatus,
        lastCheckedAt: new Date(),
        reconciliationMetadata: metadata ?? {},
      })
      .where('id = :tipId', { tipId })
      .execute();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Horizon helpers (unchanged)
  // ──────────────────────────────────────────────────────────────────────────

  private getRpcRetryConfig() {
    return {
      rpcMaxRetries: Number(this.configService?.get('STELLAR_RPC_MAX_RETRIES') ?? 3),
      rpcRetryBaseDelayMs: Number(
        this.configService?.get('STELLAR_RPC_RETRY_BASE_DELAY_MS') ?? 1000,
      ),
      rpcRetryMaxDelayMs: Number(
        this.configService?.get('STELLAR_RPC_RETRY_MAX_DELAY_MS') ?? 10000,
      ),
      rpcTimeoutMs: Number(this.configService?.get('STELLAR_RPC_TIMEOUT_MS') ?? 15000),
    };
  }

  private async fetchTransactionData(txId: string): Promise<any> {
    const horizonUrl = this.stellarService.getHorizonTxUrl(txId);
    const rpcConfig = this.getRpcRetryConfig();

    for (let attempt = 0; attempt <= rpcConfig.rpcMaxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), rpcConfig.rpcTimeoutMs);

      try {
        const response = await fetch(horizonUrl, { signal: controller.signal });

        if (response.status === 429) {
          throw Object.assign(new Error('Stellar RPC rate limited (429)'), {
            status: 429,
            response: { status: 429, headers: response.headers },
          });
        }

        if (response.status === 404) {
          throw new NotFoundException('Transaction not found on Stellar network');
        }

        if (response.status >= 500) {
          throw Object.assign(new Error(`Horizon returned ${response.status}`), {
            status: response.status,
            response: { status: response.status, headers: response.headers },
          });
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          this.logger.warn({ event: 'horizon_error', txId, status: response.status, body });
          throw new BadRequestException(
            `Horizon returned status ${response.status}`,
          );
        }

        return await response.json();
      } catch (error: any) {
        if (
          error instanceof NotFoundException ||
          error instanceof BadRequestException ||
          error instanceof ServiceUnavailableException
        ) {
          throw error;
        }

        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        const normalizedError = isAbort
          ? Object.assign(new Error('Horizon request timed out'), {
              status: 504,
              cause: error,
            })
          : error;

        if (isTransientRpcError(normalizedError)) {
          await backOffOrFailTransient(
            'fetchTransactionData',
            normalizedError,
            attempt,
            rpcConfig,
            this.logger,
          );
          continue;
        }

        throw new BadRequestException(
          `Failed to fetch transaction data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new StellarRpcUnavailableException(1);
  }

  private async processTransactionData(
    txData: any,
    txId: string,
  ): Promise<ProcessedTransactionData> {
    try {
      const operations = txData._embedded?.operations ?? [];
      const paymentOps = operations.filter(
        (op: any) => op.type === 'payment',
      );

      if (!paymentOps || paymentOps.length === 0) {
        throw new BadRequestException(
          'Transaction does not contain a payment operation',
        );
      }

      const paymentOp = paymentOps[0];

      // Validate supported asset before processing
      const assetCode = paymentOp.asset_code ?? 'XLM';
      const assetIssuer = paymentOp.asset_issuer ?? null;
      const assetType = paymentOp.asset_type;

      const supportedAsset = validateTipAsset(
        assetCode,
        assetIssuer,
        assetType,
      );

      const amount = parseFloat(paymentOp.amount);

      // Validate amount bounds (zero/negative, min, max)
      validateTipAmountBounds(amount);

      // Validate precision against asset configuration
      validateTipPrecision(amount, supportedAsset.precision);

      const receiptMetadata = this.extractSettlementReceiptMetadata(txData);
      const senderAddress = this.normalizeSenderAddress(
        receiptMetadata.anonymousSender ? null : paymentOp.from ?? null,
      );

      return { amount, senderAddress, receiptMetadata };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Failed to process tip transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractSettlementReceiptMetadata(
    txData: any,
  ): SettlementReceiptMetadata {
    const empty: SettlementReceiptMetadata = {
      settlementId: null,
      proofMetadata: null,
      anonymousSender: false,
    };

    const memoType = txData?.memo_type;
    const memoValue = txData?.memo;
    if (
      memoType !== 'text' ||
      typeof memoValue !== 'string' ||
      memoValue.length === 0
    ) {
      return empty;
    }

    try {
      const payload = JSON.parse(memoValue);
      const settlementId =
        typeof payload?.settlement_id === 'string' &&
        payload.settlement_id.length > 0
          ? payload.settlement_id
          : null;
      const proofMetadata =
        typeof payload?.proof_metadata === 'string' &&
        payload.proof_metadata.length > 0
          ? payload.proof_metadata
          : null;

      if (
        proofMetadata &&
        proofMetadata.length > TippingService.MAX_RECEIPT_PROOF_METADATA_LEN
      ) {
        throw new BadRequestException(
          'Settlement receipt proof metadata exceeds allowed bounds',
        );
      }

      return {
        settlementId,
        proofMetadata,
        anonymousSender: payload?.anonymous_sender === true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return empty;
    }
  }

  /**
   * Acquire a processing lock for a tip to prevent concurrent verify/reconciliation races
   * Issue #784: Preserve single-credit semantics
   */
  private async acquireProcessingLock(
    txId: string,
    processType: 'verify' | 'reconciliation',
  ): Promise<{ success: boolean; existingTip?: Tip }> {
    const lockId = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    return await this.tipRepository.manager.transaction(async (manager) => {
      const tipRepo = manager.getRepository(Tip);

      // Check if tip already exists
      const existingTip = await tipRepo.findOne({
        where: { txId },
      });

      if (existingTip) {
        // Tip already processed - return it for idempotent response
        if (existingTip.verificationStatus === TipVerificationStatus.VERIFIED) {
          return { success: false, existingTip };
        }

        // Check if there's an active lock
        if (existingTip.processingLock) {
          const lockAge = now.getTime() - (existingTip.lockedAt?.getTime() || 0);
          
          // If lock is stale (older than timeout), we can steal it
          if (lockAge < TippingService.LOCK_TIMEOUT_MS) {
            this.logger.warn(
              `Tip ${txId} is already being processed by ${existingTip.lockedBy}`,
            );
            return { success: false, existingTip };
          }

          this.logger.warn(
            `Stealing stale lock on tip ${txId} from ${existingTip.lockedBy}`,
          );
        }

        // Acquire or update lock
        await tipRepo.update(existingTip.id, {
          processingLock: lockId,
          lockedAt: now,
          lockedBy: processType,
          retryCount: existingTip.retryCount + 1,
          lastCheckedAt: now,
        });

        return { success: true };
      }

      // Create new pending tip with lock
      const newTip = tipRepo.create({
        txId,
        verificationStatus: TipVerificationStatus.PENDING,
        processingLock: lockId,
        lockedAt: now,
        lockedBy: processType,
        retryCount: 0,
        lastCheckedAt: now,
      });

      await tipRepo.save(newTip);
      return { success: true };
    });
  }
}
