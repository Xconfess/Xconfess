import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { Comment } from '../comment/entities/comment.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { Message } from '../messages/entities/message.entity';
import { Reaction } from '../reaction/entities/reaction.entity';
import { StellarAnchor } from '../stellar/entities/stellar-anchor.entity';
import { Tip, TipVerificationStatus } from '../tipping/entities/tip.entity';
import { User } from '../user/entities/user.entity';
import { AnalyticsEvent, AnalyticsEventName } from './entities/analytics-event.entity';

export interface TractionMetrics {
  schemaVersion: 1;
  generatedAt: string;
  users: {
    totalRegistered: number;
    dau: number;
    wau: number;
    mau: number;
  };
  engagement: {
    confessionsCreated: number;
    commentsCreated: number;
    reactionsCreated: number;
    messagesSent: number;
  };
  stellar: {
    network: string;
    walletsConnected: number;
    submittedTransactions: number;
    confirmedTransactions: number;
    failedTransactions: number;
    successfulTips: number;
    tipVolumeByAsset: Record<string, string>;
    sorobanEventsIndexed: number;
    contracts: {
      confessionAnchorContractId: string | null;
      reputationBadgesContractId: string | null;
      tippingSystemContractId: string | null;
    };
  };
  reliability: {
    transactionSuccessRate: number | null;
  };
}

const MEANINGFUL_ACTIVE_EVENTS: AnalyticsEventName[] = [
  'user_login',
  'confession_created',
  'comment_created',
  'reaction_created',
  'message_sent',
  'wallet_connected',
  'tip_completed',
];

@Injectable()
export class TractionMetricsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Reaction)
    private readonly reactionRepository: Repository<Reaction>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(StellarAnchor)
    private readonly stellarAnchorRepository: Repository<StellarAnchor>,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  async getPublicMetrics(): Promise<TractionMetrics> {
    const cacheKey = 'analytics:traction:public:v1';
    const cached = await this.cacheService.get<TractionMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    const [
      totalRegistered,
      dau,
      wau,
      mau,
      confessionsCreated,
      commentsCreated,
      reactionsCreated,
      messagesSent,
      walletsConnected,
      submittedTransactions,
      confirmedEventTransactions,
      failedTransactions,
      successfulTips,
      tipVolumeXlm,
      sorobanEventsIndexed,
    ] = await Promise.all([
      this.userRepository.count(),
      this.countActiveUsers(1),
      this.countActiveUsers(7),
      this.countActiveUsers(30),
      this.confessionRepository.count({ where: { isDeleted: false } }),
      this.commentRepository.count({ where: { isDeleted: false } }),
      this.reactionRepository.count(),
      this.messageRepository.count(),
      this.countEvents('wallet_connected'),
      this.countDistinctTransactionEvents('stellar_tx_submitted'),
      this.countDistinctTransactionEvents('stellar_tx_confirmed'),
      this.countDistinctTransactionEvents('stellar_tx_failed'),
      this.tipRepository.count({
        where: { verificationStatus: TipVerificationStatus.VERIFIED },
      }),
      this.sumVerifiedTips(),
      this.countSorobanEvidence(),
    ]);

    const confirmedTransactions = Math.max(confirmedEventTransactions, successfulTips);
    const terminalTransactions = confirmedTransactions + failedTransactions;

    const result: TractionMetrics = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      users: {
        totalRegistered,
        dau,
        wau,
        mau,
      },
      engagement: {
        confessionsCreated,
        commentsCreated,
        reactionsCreated,
        messagesSent,
      },
      stellar: {
        network: this.configService.get<string>('STELLAR_NETWORK', 'testnet'),
        walletsConnected,
        submittedTransactions,
        confirmedTransactions,
        failedTransactions,
        successfulTips,
        tipVolumeByAsset:
          Number(tipVolumeXlm) > 0 ? { XLM: this.formatAmount(tipVolumeXlm) } : {},
        sorobanEventsIndexed,
        contracts: {
          confessionAnchorContractId:
            this.configService.get<string>('CONFESSION_ANCHOR_CONTRACT_ID') ?? null,
          reputationBadgesContractId:
            this.configService.get<string>('REPUTATION_BADGES_CONTRACT_ID') ?? null,
          tippingSystemContractId:
            this.configService.get<string>('TIPPING_SYSTEM_CONTRACT_ID') ?? null,
        },
      },
      reliability: {
        transactionSuccessRate:
          terminalTransactions === 0
            ? null
            : Number(((confirmedTransactions / terminalTransactions) * 100).toFixed(2)),
      },
    };

    await this.cacheService.set(cacheKey, result, this.getCacheTtlSeconds());
    return result;
  }

  private async countActiveUsers(days: number): Promise<number> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const row = await this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.actorId)', 'count')
      .where('event.occurredAt >= :since', { since })
      .andWhere('event.actorId IS NOT NULL')
      .andWhere('event.eventName IN (:...eventNames)', {
        eventNames: MEANINGFUL_ACTIVE_EVENTS,
      })
      .getRawOne<{ count?: string }>();

    return Number(row?.count ?? 0);
  }

  private async countEvents(eventName: AnalyticsEventName): Promise<number> {
    return this.analyticsEventRepository.count({ where: { eventName } });
  }

  private async countDistinctTransactionEvents(
    eventName: AnalyticsEventName,
  ): Promise<number> {
    const row = await this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.txHash)', 'count')
      .where('event.eventName = :eventName', { eventName })
      .andWhere('event.txHash IS NOT NULL')
      .getRawOne<{ count?: string }>();

    return Number(row?.count ?? 0);
  }

  private async sumVerifiedTips(): Promise<number> {
    const row = await this.tipRepository
      .createQueryBuilder('tip')
      .select('COALESCE(SUM(tip.amount), 0)', 'total')
      .where('tip.verificationStatus = :status', {
        status: TipVerificationStatus.VERIFIED,
      })
      .getRawOne<{ total?: string }>();

    return Number(row?.total ?? 0);
  }

  private async countSorobanEvidence(): Promise<number> {
    const [indexedEvents, anchoredRecords] = await Promise.all([
      this.countEvents('soroban_event_indexed'),
      this.stellarAnchorRepository.count(),
    ]);

    return Math.max(indexedEvents, anchoredRecords);
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(7).replace(/\.?0+$/, '');
  }

  private getCacheTtlSeconds(): number {
    const ttl = Number(this.configService.get<string>('TRACTION_CACHE_TTL_SECONDS', '60'));
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
  }
}
