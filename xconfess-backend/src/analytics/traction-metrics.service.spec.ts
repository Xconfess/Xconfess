import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { TipVerificationStatus } from '../tipping/entities/tip.entity';
import { TractionMetricsService } from './traction-metrics.service';

const makeCountRepo = (count = 0) => ({
  count: jest.fn().mockResolvedValue(count),
});

const makeRawCountQuery = (count: string) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue({ count }),
});

const makeQuery = (count = 0, raw: Record<string, string> = { count: String(count) }) => ({
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(count),
  getRawOne: jest.fn().mockResolvedValue(raw),
});

describe('TractionMetricsService', () => {
  it('returns aggregate-only public metrics with real repository counts', async () => {
    const eventRepo = {
      count: jest.fn(({ where }) => {
        if (where.eventName === 'wallet_connected') return Promise.resolve(2);
        if (where.eventName === 'soroban_event_indexed') return Promise.resolve(1);
        return Promise.resolve(0);
      }),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(makeRawCountQuery('3'))
        .mockReturnValueOnce(makeRawCountQuery('5'))
        .mockReturnValueOnce(makeRawCountQuery('8'))
        .mockReturnValueOnce(makeRawCountQuery('4'))
        .mockReturnValueOnce(makeRawCountQuery('1'))
        .mockReturnValueOnce(makeRawCountQuery('1')),
    };
    const userRepo = makeCountRepo(10);
    const confessionRepo = makeCountRepo(11);
    const commentRepo = makeCountRepo(12);
    const reactionRepo = makeCountRepo(13);
    const messageRepo = makeCountRepo(14);
    const tipRepo = {
      count: jest.fn().mockResolvedValue(4),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '12.5000000' }),
      })),
    };
    const anchorRepo = makeCountRepo(1);
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as CacheService;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          STELLAR_NETWORK: 'testnet',
          CONFESSION_ANCHOR_CONTRACT_ID: 'CANCHOR',
          REPUTATION_BADGES_CONTRACT_ID: 'CREPUTATION',
          TIPPING_SYSTEM_CONTRACT_ID: 'CTIPPING',
          TRACTION_CACHE_TTL_SECONDS: '60',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    const service = new TractionMetricsService(
      eventRepo as any,
      userRepo as any,
      confessionRepo as any,
      commentRepo as any,
      reactionRepo as any,
      messageRepo as any,
      tipRepo as any,
      anchorRepo as any,
      cache,
      config,
    );

    const result = await service.getPublicMetrics();

    expect(result).toMatchObject({
      schemaVersion: 1,
      users: { totalRegistered: 10, dau: 3, wau: 5, mau: 8 },
      engagement: {
        confessionsCreated: 11,
        commentsCreated: 12,
        reactionsCreated: 13,
        messagesSent: 14,
      },
      stellar: {
        network: 'testnet',
        walletsConnected: 2,
        submittedTransactions: 4,
        confirmedTransactions: 4,
        failedTransactions: 1,
        successfulTips: 4,
        tipVolumeByAsset: { XLM: '12.5' },
        sorobanEventsIndexed: 1,
      },
    });
    expect(tipRepo.count).toHaveBeenCalledWith({
      where: { verificationStatus: TipVerificationStatus.VERIFIED },
    });
    expect(JSON.stringify(result)).not.toContain('content');
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('excludes configured test and internal IDs from public aggregates', async () => {
    const eventQueries = [
      makeQuery(0, { count: '2' }),
      makeQuery(0, { count: '3' }),
      makeQuery(0, { count: '4' }),
      makeQuery(5),
      makeQuery(0, { count: '6' }),
      makeQuery(0, { count: '7' }),
      makeQuery(0, { count: '1' }),
      makeQuery(8),
    ];
    const eventRepo = {
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => eventQueries.shift()),
    };
    const userQuery = makeQuery(9);
    const confessionQuery = makeQuery(10);
    const commentQuery = makeQuery(11);
    const reactionQuery = makeQuery(12);
    const messageQuery = makeQuery(13);
    const tipCountQuery = makeQuery(14);
    const tipSumQuery = makeQuery(0, { total: '2.5000000' });
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as CacheService;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          STELLAR_NETWORK: 'testnet',
          TRACTION_CACHE_TTL_SECONDS: '60',
          TRACTION_EXCLUDED_USER_IDS: '41,42',
          TRACTION_EXCLUDED_ANONYMOUS_USER_IDS: 'anon-test,anon-internal',
          TRACTION_EXCLUDED_ACTOR_IDS: 'actor-smoke',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    const service = new TractionMetricsService(
      eventRepo as any,
      { createQueryBuilder: jest.fn(() => userQuery) } as any,
      { createQueryBuilder: jest.fn(() => confessionQuery) } as any,
      { createQueryBuilder: jest.fn(() => commentQuery) } as any,
      { createQueryBuilder: jest.fn(() => reactionQuery) } as any,
      { createQueryBuilder: jest.fn(() => messageQuery) } as any,
      {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(tipCountQuery)
          .mockReturnValueOnce(tipSumQuery),
      } as any,
      makeCountRepo(1) as any,
      cache,
      config,
    );

    const result = await service.getPublicMetrics();

    expect(result.users).toMatchObject({ totalRegistered: 9, dau: 2, wau: 3, mau: 4 });
    expect(result.engagement).toMatchObject({
      confessionsCreated: 10,
      commentsCreated: 11,
      reactionsCreated: 12,
      messagesSent: 13,
    });
    expect(result.stellar).toMatchObject({
      walletsConnected: 5,
      submittedTransactions: 6,
      confirmedTransactions: 14,
      failedTransactions: 1,
      successfulTips: 14,
      tipVolumeByAsset: { XLM: '2.5' },
      sorobanEventsIndexed: 8,
    });

    expect(userQuery.where).toHaveBeenCalledWith(
      'user.id NOT IN (:...excludedRegisteredUserIds)',
      { excludedRegisteredUserIds: [41, 42] },
    );
    expect(confessionQuery.andWhere).toHaveBeenCalledWith(
      'confession.anonymousUserId NOT IN (:...excludedAnonymousUserIds)',
      { excludedAnonymousUserIds: ['anon-test', 'anon-internal'] },
    );
    expect(commentQuery.andWhere).toHaveBeenCalledWith(
      'anonymousUser.id NOT IN (:...excludedAnonymousUserIds)',
      { excludedAnonymousUserIds: ['anon-test', 'anon-internal'] },
    );
    expect(messageQuery.where).toHaveBeenCalledWith(
      'sender.id NOT IN (:...excludedAnonymousUserIds)',
      { excludedAnonymousUserIds: ['anon-test', 'anon-internal'] },
    );
    expect(eventRepo.count).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('actor-smoke');
    expect(JSON.stringify(result)).not.toContain('anon-test');
  });
});
