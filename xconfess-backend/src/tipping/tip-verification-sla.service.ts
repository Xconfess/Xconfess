import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LessThan, Repository } from 'typeorm';
import { Tip, TipVerificationStatus } from './entities/tip.entity';

@Injectable()
export class TipVerificationSlaService {
  private readonly logger = new Logger(TipVerificationSlaService.name);
  private readonly staleThresholdMinutes: number;
  private readonly staleThresholdMs: number;

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    private readonly configService: ConfigService,
  ) {
    this.staleThresholdMinutes = this.configService.get<number>(
      'tipping.tipVerificationStaleThresholdMinutes',
      30,
    );

    if (
      !Number.isFinite(this.staleThresholdMinutes) ||
      this.staleThresholdMinutes <= 0
    ) {
      throw new Error(
        'TIP_VERIFICATION_STALE_THRESHOLD_MINUTES must be a positive number',
      );
    }

    this.staleThresholdMs = this.staleThresholdMinutes * 60_000;
  }

  getEffectiveVerificationStatus(
    tip: Pick<Tip, 'verificationStatus' | 'createdAt'>,
    now: Date = new Date(),
  ): TipVerificationStatus {
    if (tip.verificationStatus !== TipVerificationStatus.PENDING) {
      return tip.verificationStatus;
    }

    const ageMs = now.getTime() - tip.createdAt.getTime();
    return ageMs > this.staleThresholdMs
      ? TipVerificationStatus.STALE_PENDING
      : TipVerificationStatus.PENDING;
  }

  private getStaleCutoff(now: Date): Date {
    return new Date(now.getTime() - this.staleThresholdMs);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async markStalePendingTips(): Promise<void> {
    const now = new Date();
    const cutoff = this.getStaleCutoff(now);
    this.logger.log(
      `Checking for pending tips older than ${cutoff.toISOString()} (${this.staleThresholdMinutes} minutes)`,
    );

    try {
      const result = await this.tipRepository.update(
        {
          verificationStatus: TipVerificationStatus.PENDING,
          createdAt: LessThan(cutoff),
        },
        { verificationStatus: TipVerificationStatus.STALE_PENDING },
      );

      this.logger.log(
        `Marked ${result.affected ?? 0} pending tip(s) as stale`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark stale pending tips: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
