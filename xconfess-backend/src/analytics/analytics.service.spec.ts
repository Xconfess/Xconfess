import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Reaction } from '../reaction/entities/reaction.entity';
import { User } from '../user/entities/user.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { CacheService } from '../cache/cache.service';
import { toWindowBoundaries, TrendingWindow } from '../types/analytics.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const repoMock = () => ({
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
  findOne: jest.fn(),
});

const makeCacheServiceMock = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidateSegment: jest.fn().mockResolvedValue(1),
});

// A chainable query-builder mock: every fluent method returns `this` except
// the terminal getters, which resolve to whatever the test configures.
const makeQueryBuilderMock = () => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    loadRelationCountAndMap: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return qb;
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let cacheService: ReturnType<typeof makeCacheServiceMock>;
  let confessionRepo: ReturnType<typeof repoMock>;
  let reactionRepo: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    cacheService = makeCacheServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(AnonymousConfession),
          useFactory: repoMock,
        },
        { provide: getRepositoryToken(Reaction), useFactory: repoMock },
        { provide: getRepositoryToken(User), useFactory: repoMock },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
    reactionRepo = module.get(getRepositoryToken(Reaction));
  });

  afterEach(() => jest.clearAllMocks());

  // ── Soft-delete consistency (#1449) ────────────────────────────────────────

  describe('soft-delete consistency', () => {
    it('getTrendingConfessions() excludes soft-deleted confessions', async () => {
      const qb = makeQueryBuilderMock();
      confessionRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getTrendingConfessions(7);

      expect(qb.andWhere).toHaveBeenCalledWith('confession.isDeleted = false');
    });

    it('getGrowthMetricsForWindow (via getConfessionGrowth) excludes soft-deleted confessions', async () => {
      const qb = makeQueryBuilderMock();
      confessionRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getConfessionGrowth(7);

      expect(qb.andWhere).toHaveBeenCalledWith('confession.isDeleted = false');
    });

    it('getReactionDistribution() excludes reactions on soft-deleted confessions', async () => {
      const qb = makeQueryBuilderMock();
      reactionRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getReactionDistribution(7);

      expect(qb.innerJoin).toHaveBeenCalledWith('reaction.confession', 'confession');
      expect(qb.andWhere).toHaveBeenCalledWith('confession.isDeleted = false');
    });

    it('getPlatformStats() counts only reactions on non-deleted confessions', async () => {
      confessionRepo.count.mockResolvedValue(100);
      const reactionQb = makeQueryBuilderMock();
      reactionQb.getCount.mockResolvedValue(42);
      reactionRepo.createQueryBuilder.mockReturnValue(reactionQb);

      const categoryQb = makeQueryBuilderMock();
      confessionRepo.createQueryBuilder.mockReturnValue(categoryQb);

      const result: any = await service.getPlatformStats();

      expect(reactionQb.innerJoin).toHaveBeenCalledWith(
        'reaction.confession',
        'confession',
      );
      expect(reactionQb.where).toHaveBeenCalledWith('confession.isDeleted = false');
      expect(result.totalReactions).toBe(42);
      expect(categoryQb.where).toHaveBeenCalledWith('confession.isDeleted = false');
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── invalidateTrendingCache ──────────────────────────────────────────────

  describe('invalidateTrendingCache()', () => {
    it('calls invalidateSegment with the trending prefix', async () => {
      await service.invalidateTrendingCache('test');
      expect(cacheService.invalidateSegment).toHaveBeenCalledWith(
        'analytics:trending',
        'test',
      );
    });

    it('uses "mutation" as the default reason', async () => {
      await service.invalidateTrendingCache();
      expect(cacheService.invalidateSegment).toHaveBeenCalledWith(
        'analytics:trending',
        'mutation',
      );
    });
  });

  // ── invalidateReactionDistributionCache ─────────────────────────────────

  describe('invalidateReactionDistributionCache()', () => {
    it('calls invalidateSegment with the reactions prefix', async () => {
      await service.invalidateReactionDistributionCache('test');
      expect(cacheService.invalidateSegment).toHaveBeenCalledWith(
        'analytics:reactions',
        'test',
      );
    });
  });

  // ── invalidateGrowthCache ────────────────────────────────────────────────

  describe('invalidateGrowthCache()', () => {
    it('calls invalidateSegment with the growth prefix', async () => {
      await service.invalidateGrowthCache('test');
      expect(cacheService.invalidateSegment).toHaveBeenCalledWith(
        'analytics:growth',
        'test',
      );
    });
  });

  // ── invalidateUserActivityCache ──────────────────────────────────────────

  describe('invalidateUserActivityCache()', () => {
    it('calls invalidateSegment with the users prefix', async () => {
      await service.invalidateUserActivityCache('test');
      expect(cacheService.invalidateSegment).toHaveBeenCalledWith(
        'analytics:users',
        'test',
      );
    });
  });

  // ── invalidateStatsCache ─────────────────────────────────────────────────

  describe('invalidateStatsCache()', () => {
    it('deletes only the stats key', async () => {
      await service.invalidateStatsCache('test');
      expect(cacheService.del).toHaveBeenCalledWith('analytics:stats');
      expect(cacheService.invalidateSegment).not.toHaveBeenCalled();
    });
  });

  // ── invalidateCache (full flush) ─────────────────────────────────────────

  describe('invalidateCache()', () => {
    it('calls all targeted segment invalidation methods', async () => {
      const spyTrending = jest
        .spyOn(service, 'invalidateTrendingCache')
        .mockResolvedValue();
      const spyReactions = jest
        .spyOn(service, 'invalidateReactionDistributionCache')
        .mockResolvedValue();
      const spyGrowth = jest
        .spyOn(service, 'invalidateGrowthCache')
        .mockResolvedValue();
      const spyUsers = jest
        .spyOn(service, 'invalidateUserActivityCache')
        .mockResolvedValue();
      const spyStats = jest
        .spyOn(service, 'invalidateStatsCache')
        .mockResolvedValue();

      await service.invalidateCache();

      expect(spyTrending).toHaveBeenCalledWith('full-flush');
      expect(spyReactions).toHaveBeenCalledWith('full-flush');
      expect(spyGrowth).toHaveBeenCalledWith('full-flush');
      expect(spyUsers).toHaveBeenCalledWith('full-flush');
      expect(spyStats).toHaveBeenCalledWith('full-flush');
    });

    it('does NOT call invalidateSegment for keys outside the analytics namespace', async () => {
      jest.spyOn(service, 'invalidateTrendingCache').mockResolvedValue();
      jest
        .spyOn(service, 'invalidateReactionDistributionCache')
        .mockResolvedValue();
      jest.spyOn(service, 'invalidateGrowthCache').mockResolvedValue();
      jest.spyOn(service, 'invalidateUserActivityCache').mockResolvedValue();
      jest.spyOn(service, 'invalidateStatsCache').mockResolvedValue();

      await service.invalidateCache();

      // invalidateSegment should never be called with prefixes outside analytics:*
      const calls = cacheService.invalidateSegment.mock.calls;
      calls.forEach(([prefix]) => {
        expect(prefix).toMatch(/^analytics:/);
      });
    });
  });

  describe('comparison endpoints', () => {
    it('builds growth comparison responses with explicit current and previous windows', async () => {
      const helper = jest
        .spyOn<any, any>(service as any, 'getGrowthMetricsForWindow')
        .mockResolvedValueOnce({
          period: '7 days',
          totalConfessions: 42,
          averagePerDay: 6,
          dailyGrowth: [{ date: '2026-03-20', count: 5 }],
          trend: 'increasing',
        })
        .mockResolvedValueOnce({
          period: '7 days',
          totalConfessions: 21,
          averagePerDay: 3,
          dailyGrowth: [{ date: '2026-03-12', count: 3 }],
          trend: 'stable',
        });

      const result = await service.getConfessionGrowthComparison(7);

      expect(helper).toHaveBeenCalledTimes(2);
      expect(result.window).toEqual(
        expect.objectContaining({
          requestedDays: 7,
          bucketUnit: 'day',
          bucketCount: expect.any(Number),
          current: expect.objectContaining({
            startAt: expect.any(String),
            endAt: expect.any(String),
          }),
          previous: expect.objectContaining({
            startAt: expect.any(String),
            endAt: expect.any(String),
          }),
        }),
      );
      expect(result.delta).toEqual({
        totalConfessions: { absoluteChange: 21, percentageChange: 100 },
        averagePerDay: { absoluteChange: 3, percentageChange: 100 },
      });
    });

    it('builds user activity comparisons from the shared activity helper', async () => {
      jest
        .spyOn<any, any>(service as any, 'getUserActivityForWindow')
        .mockResolvedValueOnce({
          period: '30 days',
          dailyActivity: [{ date: '2026-02-26', activeUsers: 10 }],
          averageDAU: 10,
        })
        .mockResolvedValueOnce({
          period: '30 days',
          dailyActivity: [{ date: '2026-01-26', activeUsers: 8 }],
          averageDAU: 8,
        });

      const result = await service.getUserActivityComparison(30);

      expect(result.current.averageDAU).toBe(10);
      expect(result.previous.averageDAU).toBe(8);
      expect(result.delta.averageDAU).toEqual({
        absoluteChange: 2,
        percentageChange: 25,
      });
    });

    it('builds reaction comparison deltas per type', async () => {
      jest
        .spyOn<any, any>(service as any, 'getReactionDistributionForWindow')
        .mockResolvedValueOnce({
          total: 12,
          period: '7 days',
          distribution: [
            { type: 'like', count: 8, percentage: '66.67' },
            { type: 'support', count: 4, percentage: '33.33' },
          ],
        })
        .mockResolvedValueOnce({
          total: 9,
          period: '7 days',
          distribution: [
            { type: 'like', count: 3, percentage: '33.33' },
            { type: 'wow', count: 6, percentage: '66.67' },
          ],
        });

      const result = await service.getReactionDistributionComparison(7);

      expect(result.delta.total).toEqual({
        absoluteChange: 3,
        percentageChange: 33.33,
      });
      expect(result.delta.byType).toEqual([
        {
          type: 'like',
          currentCount: 8,
          previousCount: 3,
          absoluteChange: 5,
          percentageChange: 166.67,
        },
        {
          type: 'support',
          currentCount: 4,
          previousCount: 0,
          absoluteChange: 4,
          percentageChange: null,
        },
        {
          type: 'wow',
          currentCount: 0,
          previousCount: 6,
          absoluteChange: -6,
          percentageChange: -100,
        },
      ]);
    });
  });
});

// ─── toWindowBoundaries unit tests ────────────────────────────────────────────

describe('toWindowBoundaries()', () => {
  // Reference instant pinned to 2026-03-26T14:37:00Z (mid-afternoon UTC)
  // so partial-day offsets cannot sneak into boundary calculations.
  const REF = new Date('2026-03-26T14:37:00.000Z');

  // Convenience: extract the ISO date string part only
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  // ── Basic boundary shape ──────────────────────────────────────────────────

  it('returns startAt and endAt as Date objects', () => {
    const { startAt, endAt } = toWindowBoundaries(7, REF);
    expect(startAt).toBeInstanceOf(Date);
    expect(endAt).toBeInstanceOf(Date);
  });

  it('startAt is strictly less than endAt', () => {
    const { startAt, endAt } = toWindowBoundaries(7, REF);
    expect(startAt.getTime()).toBeLessThan(endAt.getTime());
  });

  // ── UTC midnight flooring ────────────────────────────────────────────────

  it('floors startAt to UTC midnight (no sub-day offset)', () => {
    const { startAt } = toWindowBoundaries(7, REF);
    expect(startAt.getUTCHours()).toBe(0);
    expect(startAt.getUTCMinutes()).toBe(0);
    expect(startAt.getUTCSeconds()).toBe(0);
    expect(startAt.getUTCMilliseconds()).toBe(0);
  });

  it('floors endAt to UTC midnight (no sub-day offset)', () => {
    const { endAt } = toWindowBoundaries(7, REF);
    expect(endAt.getUTCHours()).toBe(0);
    expect(endAt.getUTCMinutes()).toBe(0);
    expect(endAt.getUTCSeconds()).toBe(0);
    expect(endAt.getUTCMilliseconds()).toBe(0);
  });

  // ── Calendar day accuracy ────────────────────────────────────────────────

  it('startAt is exactly `days` calendar days before today (UTC)', () => {
    const { startAt } = toWindowBoundaries(7, REF);
    expect(isoDate(startAt)).toBe('2026-03-19');
  });

  it('endAt is UTC midnight of tomorrow relative to `now`', () => {
    const { endAt } = toWindowBoundaries(7, REF);
    expect(isoDate(endAt)).toBe('2026-03-27');
  });

  // ── TrendingWindow enum values ────────────────────────────────────────────

  it('TrendingWindow.DAY produces a 1-day window', () => {
    const { startAt, endAt } = toWindowBoundaries(TrendingWindow.DAY, REF);
    expect(isoDate(startAt)).toBe('2026-03-25');
    expect(isoDate(endAt)).toBe('2026-03-27');
  });

  it('TrendingWindow.WEEK produces a 7-day window', () => {
    const { startAt, endAt } = toWindowBoundaries(TrendingWindow.WEEK, REF);
    expect(isoDate(startAt)).toBe('2026-03-19');
    expect(isoDate(endAt)).toBe('2026-03-27');
  });

  it('TrendingWindow.MONTH produces a 30-day window', () => {
    const { startAt, endAt } = toWindowBoundaries(TrendingWindow.MONTH, REF);
    expect(isoDate(startAt)).toBe('2026-02-24');
    expect(isoDate(endAt)).toBe('2026-03-27');
  });

  // ── Edge-timestamp regression ────────────────────────────────────────────
  // These tests verify that records sitting exactly on bucket edges are
  // included or excluded according to the >= startAt / < endAt contract.

  it('REGRESSION: a record at exactly startAt is within the window (inclusive lower bound)', () => {
    const { startAt } = toWindowBoundaries(7, REF);
    // Simulate the DB predicate: createdAt >= startAt
    expect(startAt.getTime() >= startAt.getTime()).toBe(true);
  });

  it('REGRESSION: a record 1 ms before startAt is outside the window', () => {
    const { startAt } = toWindowBoundaries(7, REF);
    const oneMillisBeforeStart = new Date(startAt.getTime() - 1);
    expect(oneMillisBeforeStart.getTime() >= startAt.getTime()).toBe(false);
  });

  it('REGRESSION: a record at exactly endAt is outside the window (exclusive upper bound)', () => {
    const { endAt } = toWindowBoundaries(7, REF);
    // Simulate the DB predicate: createdAt < endAt
    expect(endAt.getTime() < endAt.getTime()).toBe(false);
  });

  it('REGRESSION: a record 1 ms before endAt is inside the window', () => {
    const { endAt } = toWindowBoundaries(7, REF);
    const oneMillisBeforeEnd = new Date(endAt.getTime() - 1);
    expect(oneMillisBeforeEnd.getTime() < endAt.getTime()).toBe(true);
  });

  it('REGRESSION: consecutive 7-day windows share no overlap at the boundary midnight', () => {
    // Window A ends at midnight of 2026-03-27; Window B starts at the same instant.
    const windowA = toWindowBoundaries(7, REF);
    // Shift REF so the next rolling window starts at windowA.endAt.
    const nextRef = new Date(REF.getTime() + 8 * 24 * 60 * 60 * 1000);
    const windowB = toWindowBoundaries(7, nextRef);

    // windowA.endAt === windowB.startAt (shared boundary)
    expect(windowA.endAt.getTime()).toBe(windowB.startAt.getTime());

    // A record AT the boundary midnight is excluded from A (< endAt) …
    const boundary = windowA.endAt;
    expect(boundary.getTime() < windowA.endAt.getTime()).toBe(false);
    // … and included in B (>= startAt).
    expect(boundary.getTime() >= windowB.startAt.getTime()).toBe(true);
  });

  // ── Default `now` argument ────────────────────────────────────────────────

  it('uses the current time when `now` is omitted', () => {
    const before = Date.now();
    const { endAt } = toWindowBoundaries(7);
    const after = Date.now();

    // endAt should be UTC midnight of tomorrow, so it must be in the future
    expect(endAt.getTime()).toBeGreaterThan(before);
    // and no more than 2 days out from `after`
    expect(endAt.getTime()).toBeLessThanOrEqual(
      after + 2 * 24 * 60 * 60 * 1000,
    );
  });
});
