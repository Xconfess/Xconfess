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
});
