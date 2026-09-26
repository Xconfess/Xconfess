import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tip } from './entities/tip.entity';
import { StellarService } from '../stellar/stellar.service';

export enum TipSubmissionStatus {
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Injectable()
export class SorobanLifecycleService {
  private readonly logger = new Logger(SorobanLifecycleService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    private readonly stellarService: StellarService,
  ) {}

  async recordSubmission(
    tip: Tip,
    metadata?: Record<string, any>,
  ): Promise<Tip> {
    tip.submissionStatus = TipSubmissionStatus.SUBMITTED;
    tip.submittedAt = new Date();
    tip.sorobanMetadata = metadata || {};

    return this.tipRepository.save(tip);
  }

  async recordConfirmation(
    tip: Tip,
    ledgerSequence: number,
    metadata?: Record<string, any>,
  ): Promise<Tip> {
    tip.submissionStatus = TipSubmissionStatus.CONFIRMED;
    tip.confirmedAt = new Date();
    tip.ledgerSequence = ledgerSequence;
    tip.sorobanMetadata = {
      ...tip.sorobanMetadata,
      ...metadata,
      confirmedLedgerSequence: ledgerSequence,
    };
    tip.verificationStatus = 'verified';
    tip.verifiedAt = new Date();

    return this.tipRepository.save(tip);
  }

  async recordFailure(
    tip: Tip,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<Tip> {
    tip.submissionStatus = TipSubmissionStatus.FAILED;
    tip.failedAt = new Date();
    tip.failureReason = reason;
    tip.sorobanMetadata = {
      ...tip.sorobanMetadata,
      ...metadata,
      failureTimestamp: new Date().toISOString(),
    };
    tip.verificationStatus = 'rejected';
    tip.rejectionReason = reason;

    return this.tipRepository.save(tip);
  }

  async recordExpiry(
    tip: Tip,
    blockHeight: number,
  ): Promise<Tip> {
    tip.submissionStatus = TipSubmissionStatus.EXPIRED;
    tip.failedAt = new Date();
    tip.expiryBlockHeight = blockHeight;
    tip.failureReason = 'Transaction expired before confirmation';
    tip.verificationStatus = 'rejected';
    tip.rejectionReason = 'Transaction expired';

    return this.tipRepository.save(tip);
  }

  async refreshConfirmation(txHash: string): Promise<Tip | null> {
    const tip = await this.tipRepository.findOne({
      where: { txId: txHash },
    });

    if (!tip) return null;

    try {
      const txResult = await this.stellarService.verifyTransactionFull(txHash);

      if (txResult.success) {
        return this.recordConfirmation(tip, txResult.ledger);
      } else {
        return this.recordFailure(tip, 'Transaction marked as failed on chain');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to refresh confirmation for tx ${txHash}: ${message}`,
      );
      throw error;
    }
  }

  async getTransactionTimeline(
    confessionId: string,
  ): Promise<Array<{
    tipId: string;
    txId: string;
    status: string;
    submittedAt: Date | null;
    confirmedAt: Date | null;
    failedAt: Date | null;
  }>> {
    return this.tipRepository
      .createQueryBuilder('tip')
      .select([
        'tip.id as tipId',
        'tip.txId as txId',
        'tip.submissionStatus as status',
        'tip.submittedAt as submittedAt',
        'tip.confirmedAt as confirmedAt',
        'tip.failedAt as failedAt',
      ])
      .where('tip.confessionId = :confessionId', { confessionId })
      .orderBy('tip.submittedAt', 'DESC')
      .getRawMany();
  }

  async getPendingConfirmations(): Promise<Tip[]> {
    return this.tipRepository.find({
      where: {
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      },
      order: { submittedAt: 'ASC' },
    });
  }

  async isExpired(tip: Tip, currentBlockHeight: number): Promise<boolean> {
    if (!tip.expiryBlockHeight) return false;
    return currentBlockHeight > tip.expiryBlockHeight;
  }
}
