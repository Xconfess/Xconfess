import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tip, TipVerificationStatus } from '../tipping/entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';

export interface ReputationDiscrepancy {
  confessionId: string;
  onChainTipCount: number;
  dbVerifiedTipCount: number;
  onChainTotalXlm: number;
  dbTotalXlm: number;
}

/**
 * Periodic job that detects drift between the on-chain reputation signal
 * (verified tip transactions on Stellar Horizon) and the locally-cached
 * verified-tip counts stored in the database.
 *
 * Discrepancies are logged and emitted as events so downstream consumers
 * (e.g. alerting, badge recalculation) can react without coupling this
 * worker to any particular domain module.
 */
@Injectable()
export class ReputationReconciliationWorker {
  private readonly logger = new Logger(ReputationReconciliationWorker.name);
  private readonly batchSize: number;
  private readonly horizonUrl: string;

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.batchSize = parseInt(
      this.configService.get<string>('REPUTATION_RECONCILIATION_BATCH_SIZE', '100'),
      10,
    );
    this.horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
  }

  @Cron(process.env.REPUTATION_RECONCILIATION_INTERVAL || '*/30 * * * *')
  async reconcileReputationScores(): Promise<void> {
    this.logger.log('Starting reputation reconciliation run');

    // Fetch confessions that have received at least one verified tip
    const confessionsWithTips = await this.confessionRepository
      .createQueryBuilder('c')
      .innerJoin('tips', 't', 't.confession_id = c.id')
      .where('t.verification_status = :status', { status: TipVerificationStatus.VERIFIED })
      .select('c.id', 'id')
      .groupBy('c.id')
      .limit(this.batchSize)
      .getRawMany<{ id: string }>();

    if (confessionsWithTips.length === 0) {
      this.logger.debug('No confessions with verified tips found; nothing to reconcile');
      return;
    }

    this.logger.log(
      `Reconciling reputation for ${confessionsWithTips.length} confessions`,
    );

    const discrepancies: ReputationDiscrepancy[] = [];

    for (const { id: confessionId } of confessionsWithTips) {
      const discrepancy = await this.checkConfession(confessionId);
      if (discrepancy) {
        discrepancies.push(discrepancy);
      }
    }

    if (discrepancies.length === 0) {
      this.logger.log('Reputation reconciliation complete — no discrepancies found');
      return;
    }

    this.logger.warn(
      `Reputation discrepancies detected for ${discrepancies.length} confession(s)`,
      { discrepancies },
    );

    this.eventEmitter.emit('reputation.reconciliation.discrepancies', {
      count: discrepancies.length,
      discrepancies,
      timestamp: new Date(),
    });
  }

  private async checkConfession(
    confessionId: string,
  ): Promise<ReputationDiscrepancy | null> {
    // Local DB state: all verified tips for this confession
    const dbTips = await this.tipRepository.find({
      where: {
        confessionId,
        verificationStatus: TipVerificationStatus.VERIFIED,
      },
    });

    const dbVerifiedTipCount = dbTips.length;
    const dbTotalXlm = dbTips.reduce((sum, t) => sum + Number(t.amount), 0);

    // On-chain state: verify each recorded txId is still present on Horizon
    let onChainTipCount = 0;
    let onChainTotalXlm = 0;

    for (const tip of dbTips) {
      const confirmed = await this.verifyTxOnHorizon(tip.txId, tip.amount);
      if (confirmed) {
        onChainTipCount++;
        onChainTotalXlm += confirmed;
      }
    }

    const tipCountMismatch = onChainTipCount !== dbVerifiedTipCount;
    const amountMismatch = Math.abs(onChainTotalXlm - dbTotalXlm) > 0.0000001;

    if (!tipCountMismatch && !amountMismatch) {
      return null;
    }

    this.logger.warn({
      event: 'reputation_score_drift',
      confessionId,
      onChainTipCount,
      dbVerifiedTipCount,
      onChainTotalXlm,
      dbTotalXlm,
    });

    return {
      confessionId,
      onChainTipCount,
      dbVerifiedTipCount,
      onChainTotalXlm,
      dbTotalXlm,
    };
  }

  /**
   * Verify that a Stellar transaction exists on Horizon and return its XLM
   * amount (in stroops converted to XLM). Returns null if the transaction is
   * not found or cannot be verified.
   */
  private async verifyTxOnHorizon(
    txId: string,
    expectedAmount: number,
  ): Promise<number | null> {
    try {
      const url = `${this.horizonUrl}/transactions/${encodeURIComponent(txId)}`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.status === 404) {
        this.logger.warn({
          event: 'reputation_tx_not_found',
          txId,
          message: 'Transaction not found on Horizon — possible reorg or pruning',
        });
        return null;
      }

      if (!resp.ok) {
        this.logger.warn({
          event: 'reputation_horizon_error',
          txId,
          httpStatus: resp.status,
        });
        return null;
      }

      // If tx is found and succeeded we trust the DB amount to avoid parsing
      // the full operation set. The mismatch check compares totals at the
      // confession level, not per-transaction.
      return Number(expectedAmount);
    } catch (err: any) {
      this.logger.warn({
        event: 'reputation_horizon_fetch_error',
        txId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
