import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { CacheService } from '../cache/cache.service';
import { Comment } from '../comment/entities/comment.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { Message } from '../messages/entities/message.entity';
import { Reaction } from '../reaction/entities/reaction.entity';
import { StellarAnchor } from '../stellar/entities/stellar-anchor.entity';
import { Tip, TipVerificationStatus } from '../tipping/entities/tip.entity';
import { User } from '../user/entities/user.entity';
import { AnalyticsEvent, AnalyticsEventName } from './entities/analytics-event.entity';
import { ANALYTICS_PRIVACY } from './analytics.constants';

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
  retention: {
    d1Percent: number | null;
    d7Percent: number | null;
    d1CohortSize: number | null;
    d7CohortSize: number | null;
    minimumCohortSize: number;
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
    const cacheKey = `analytics:traction:public:v2:${this.exclusionFingerprint()}`;
    const cached = await this.cacheService.get<TractionMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    const excludedRegisteredUserIds = this.getExcludedRegisteredUserIds();
    const excludedAnonymousUserIds = this.getExcludedAnonymousUserIds();
    const excludedActorIds = this.getExcludedActorIds();

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
      retention,
    ] = await Promise.all([
      this.countRegisteredUsers(excludedRegisteredUserIds),
      this.countActiveUsers(1, excludedActorIds),
      this.countActiveUsers(7, excludedActorIds),
      this.countActiveUsers(30, excludedActorIds),
      this.countConfessionsCreated(excludedAnonymousUserIds),
      this.countCommentsCreated(excludedAnonymousUserIds),
      this.countReactionsCreated(excludedAnonymousUserIds),
      this.countMessagesSent(excludedAnonymousUserIds),
      this.countEvents('wallet_connected', excludedActorIds),
      this.countDistinctTransactionEvents('stellar_tx_submitted', excludedActorIds),
      this.countDistinctTransactionEvents('stellar_tx_confirmed', excludedActorIds),
      this.countDistinctTransactionEvents('stellar_tx_failed', excludedActorIds),
      this.countVerifiedTips(excludedAnonymousUserIds),
      this.sumVerifiedTips(excludedAnonymousUserIds),
      this.countSorobanEvidence(),
      this.calculateRetention(excludedActorIds),
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
      retention,
    };

    await this.cacheService.set(cacheKey, result, this.getCacheTtlSeconds());
    return result;
  }

  private async calculateRetention(excludedActorIds: string[]): Promise<TractionMetrics['retention']> {
    // Keep aggregate metrics available for lightweight repository mocks and degraded
    // environments where retention data has not been provisioned yet.
    if (typeof this.analyticsEventRepository.createQueryBuilder !== 'function') {
      return this.emptyRetentionMetrics();
    }
    const query = this.analyticsEventRepository.createQueryBuilder('event');
    if (!query || typeof query.select !== 'function') {
      return this.emptyRetentionMetrics();
    }
    const rows = await query
      .select('event.actorId', 'actorId')
      .addSelect('event.occurredAt', 'occurredAt')
      .where('event.actorId IS NOT NULL')
      .andWhere('event.eventName IN (:...eventNames)', {
        eventNames: MEANINGFUL_ACTIVE_EVENTS,
      })
      .getRawMany<{ actorId: string; occurredAt: Date | string }>();

    const excluded = new Set(excludedActorIds);
    const activityByActor = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.actorId || excluded.has(row.actorId)) continue;
      const date = new Date(row.occurredAt);
      if (Number.isNaN(date.getTime())) continue;
      const day = date.toISOString().slice(0, 10);
      const activity = activityByActor.get(row.actorId) ?? new Set<string>();
      activity.add(day);
      activityByActor.set(row.actorId, activity);
    }

    const firstSeen = [...activityByActor.entries()].map(([actorId, days]) => ({
      actorId,
      days,
      firstDay: [...days].sort()[0],
    }));
    const today = new Date();
    const dayOffset = (offset: number) => {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      date.setUTCDate(date.getUTCDate() - offset);
      return date.toISOString().slice(0, 10);
    };
    const dayAfter = (day: string, offset: number) => {
      const date = new Date(`${day}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };

    const summarize = (maturityDays: number) => {
      const latestEligible = dayOffset(maturityDays + 1);
      const earliestEligible = dayOffset(30 + maturityDays + 1);
      const cohort = firstSeen.filter(
        (entry) => entry.firstDay >= earliestEligible && entry.firstDay <= latestEligible,
      );
      if (cohort.length < ANALYTICS_PRIVACY.MIN_COHORT_SIZE) {
        return { percent: null, cohortSize: null };
      }
      const retained = cohort.filter((entry) => entry.days.has(dayAfter(entry.firstDay, maturityDays))).length;
      return {
        percent: Number(((retained / cohort.length) * 100).toFixed(1)),
        cohortSize: cohort.length,
      };
    };

    const d1 = summarize(1);
    const d7 = summarize(7);
    return {
      d1Percent: d1.percent,
      d7Percent: d7.percent,
      d1CohortSize: d1.cohortSize,
      d7CohortSize: d7.cohortSize,
      minimumCohortSize: ANALYTICS_PRIVACY.MIN_COHORT_SIZE,
    };
  }

  private emptyRetentionMetrics(): TractionMetrics['retention'] {
    return {
      d1Percent: null,
      d7Percent: null,
      d1CohortSize: null,
      d7CohortSize: null,
      minimumCohortSize: ANALYTICS_PRIVACY.MIN_COHORT_SIZE,
    };
  }

  private async countRegisteredUsers(excludedRegisteredUserIds: number[]): Promise<number> {
    if (excludedRegisteredUserIds.length === 0) {
      return this.userRepository.count();
    }

    return this.userRepository
      .createQueryBuilder('user')
      .where('user.id NOT IN (:...excludedRegisteredUserIds)', {
        excludedRegisteredUserIds,
      })
      .getCount();
  }

  private async countActiveUsers(
    days: number,
    excludedActorIds: string[],
  ): Promise<number> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const query = this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.actorId)', 'count')
      .where('event.occurredAt >= :since', { since })
      .andWhere('event.actorId IS NOT NULL')
      .andWhere('event.eventName IN (:...eventNames)', {
        eventNames: MEANINGFUL_ACTIVE_EVENTS,
      });

    this.applyActorExclusion(query, excludedActorIds, false);

    const row = await query.getRawOne<{ count?: string }>();

    return Number(row?.count ?? 0);
  }

  private async countConfessionsCreated(
    excludedAnonymousUserIds: string[],
  ): Promise<number> {
    if (excludedAnonymousUserIds.length === 0) {
      return this.confessionRepository.count({ where: { isDeleted: false } });
    }

    return this.confessionRepository
      .createQueryBuilder('confession')
      .where('confession.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('confession.anonymousUserId NOT IN (:...excludedAnonymousUserIds)', {
        excludedAnonymousUserIds,
      })
      .getCount();
  }

  private async countCommentsCreated(
    excludedAnonymousUserIds: string[],
  ): Promise<number> {
    if (excludedAnonymousUserIds.length === 0) {
      return this.commentRepository.count({ where: { isDeleted: false } });
    }

    return this.commentRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.anonymousUser', 'anonymousUser')
      .where('comment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('anonymousUser.id NOT IN (:...excludedAnonymousUserIds)', {
        excludedAnonymousUserIds,
      })
      .getCount();
  }

  private async countReactionsCreated(
    excludedAnonymousUserIds: string[],
  ): Promise<number> {
    if (excludedAnonymousUserIds.length === 0) {
      return this.reactionRepository.count();
    }

    return this.reactionRepository
      .createQueryBuilder('reaction')
      .innerJoin('reaction.anonymousUser', 'anonymousUser')
      .where('anonymousUser.id NOT IN (:...excludedAnonymousUserIds)', {
        excludedAnonymousUserIds,
      })
      .getCount();
  }

  private async countMessagesSent(excludedAnonymousUserIds: string[]): Promise<number> {
    if (excludedAnonymousUserIds.length === 0) {
      return this.messageRepository.count();
    }

    return this.messageRepository
      .createQueryBuilder('message')
      .innerJoin('message.sender', 'sender')
      .where('sender.id NOT IN (:...excludedAnonymousUserIds)', {
        excludedAnonymousUserIds,
      })
      .getCount();
  }

  private async countEvents(
    eventName: AnalyticsEventName,
    excludedActorIds: string[] = this.getExcludedActorIds(),
  ): Promise<number> {
    if (excludedActorIds.length === 0) {
      return this.analyticsEventRepository.count({ where: { eventName } });
    }

    const query = this.analyticsEventRepository
      .createQueryBuilder('event')
      .where('event.eventName = :eventName', { eventName });

    this.applyActorExclusion(query, excludedActorIds, true);

    return query.getCount();
  }

  private async countDistinctTransactionEvents(
    eventName: AnalyticsEventName,
    excludedActorIds: string[],
  ): Promise<number> {
    const query = this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.txHash)', 'count')
      .where('event.eventName = :eventName', { eventName })
      .andWhere('event.txHash IS NOT NULL');

    this.applyActorExclusion(query, excludedActorIds, true);

    const row = await query.getRawOne<{ count?: string }>();

    return Number(row?.count ?? 0);
  }

  private async countVerifiedTips(excludedAnonymousUserIds: string[]): Promise<number> {
    if (excludedAnonymousUserIds.length === 0) {
      return this.tipRepository.count({
        where: { verificationStatus: TipVerificationStatus.VERIFIED },
      });
    }

    return this.tipRepository
      .createQueryBuilder('tip')
      .innerJoin('tip.confession', 'confession')
      .where('tip.verificationStatus = :status', {
        status: TipVerificationStatus.VERIFIED,
      })
      .andWhere('confession.anonymousUserId NOT IN (:...excludedAnonymousUserIds)', {
        excludedAnonymousUserIds,
      })
      .getCount();
  }

  private async sumVerifiedTips(excludedAnonymousUserIds: string[]): Promise<number> {
    const query = this.tipRepository
      .createQueryBuilder('tip')
      .select('COALESCE(SUM(tip.amount), 0)', 'total')
      .where('tip.verificationStatus = :status', {
        status: TipVerificationStatus.VERIFIED,
      });

    if (excludedAnonymousUserIds.length > 0) {
      query
        .innerJoin('tip.confession', 'confession')
        .andWhere('confession.anonymousUserId NOT IN (:...excludedAnonymousUserIds)', {
          excludedAnonymousUserIds,
        });
    }

    const row = await query.getRawOne<{ total?: string }>();

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

  private applyActorExclusion(
    query: {
      andWhere: (condition: string, parameters?: Record<string, unknown>) => unknown;
    },
    excludedActorIds: string[],
    keepAnonymousEvents: boolean,
  ): void {
    if (excludedActorIds.length === 0) {
      return;
    }

    query.andWhere(
      keepAnonymousEvents
        ? '(event.actorId IS NULL OR event.actorId NOT IN (:...excludedActorIds))'
        : 'event.actorId NOT IN (:...excludedActorIds)',
      { excludedActorIds },
    );
  }

  private getExcludedRegisteredUserIds(): number[] {
    return this.parseCsv('TRACTION_EXCLUDED_USER_IDS')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  private getExcludedAnonymousUserIds(): string[] {
    return this.parseCsv('TRACTION_EXCLUDED_ANONYMOUS_USER_IDS');
  }

  private getExcludedActorIds(): string[] {
    return [
      ...this.parseCsv('TRACTION_EXCLUDED_ACTOR_IDS'),
      ...this.getExcludedAnonymousUserIds(),
      ...this.getExcludedRegisteredUserIds().map(String),
    ].filter((value, index, values) => values.indexOf(value) === index);
  }

  private exclusionFingerprint(): string {
    const values = [
      ...this.getExcludedActorIds(),
      ...this.getExcludedAnonymousUserIds(),
      ...this.getExcludedRegisteredUserIds().map(String),
    ].sort();

    if (values.length === 0) {
      return 'none';
    }

    return createHash('sha256').update(values.join('\n')).digest('hex').slice(0, 12);
  }

  private parseCsv(key: string): string[] {
    const raw = this.configService.get<string>(key, '');
    if (!raw) {
      return [];
    }

    return raw
      .split(',')
      .map((value) => value.trim())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  }
}
