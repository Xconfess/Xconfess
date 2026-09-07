/**
 * Issue #1854: Cache namespace invalidation tests
 *
 * Validates that:
 * - Namespace key construction is deterministic
 * - Invalidating one namespace does not clear unrelated keys
 * - Cross-namespace isolation is maintained
 * - Missing Redis/cache backend behavior is tested
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheService } from './cache.service';
import { CacheDiagnosticsService } from './cache-diagnostics.service';
import {
  CacheKeyBuilder,
  CacheNamespace,
  AnalyticsEntityType,
  UserEntityType,
  ConfessionEntityType,
  ReactionEntityType,
  AnalyticsCacheKeys,
  ViewsCacheKeys,
  UserCacheKeys,
  InvalidationPrefixes,
} from './cache-namespace';

describe('Cache Namespace Invalidation (issue #1854)', () => {
  describe('CacheKeyBuilder - deterministic key construction', () => {
    it('should produce identical keys for identical inputs', () => {
      const key1 = new CacheKeyBuilder('analytics')
        .entity('trending')
        .identifier('7d')
        .build();
      const key2 = new CacheKeyBuilder('analytics')
        .entity('trending')
        .identifier('7d')
        .build();

      expect(key1).toBe(key2);
    });

    it('should lowercase namespace and entity', () => {
      const key = new CacheKeyBuilder('ANALYTICS')
        .entity('TRENDING')
        .identifier('7d')
        .build();

      expect(key).toBe('analytics:trending:7d');
    });

    it('should build key with all parts', () => {
      const key = new CacheKeyBuilder('analytics')
        .entity('reactions')
        .identifier('30d')
        .context('summary')
        .build();

      expect(key).toBe('analytics:reactions:30d:summary');
    });

    it('should produce different keys for different namespaces', () => {
      const key1 = new CacheKeyBuilder('analytics')
        .entity('stats')
        .build();
      const key2 = new CacheKeyBuilder('user')
        .entity('stats')
        .build();

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different identifiers', () => {
      const key1 = AnalyticsCacheKeys.trending(7);
      const key2 = AnalyticsCacheKeys.trending(30);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Pre-built key generators - deterministic output', () => {
    it('AnalyticsCacheKeys.trending should generate correct format', () => {
      expect(AnalyticsCacheKeys.trending(7)).toBe('analytics:trending:7d');
      expect(AnalyticsCacheKeys.trending(30)).toBe('analytics:trending:30d');
    });

    it('AnalyticsCacheKeys.stats should generate correct format', () => {
      expect(AnalyticsCacheKeys.stats()).toBe('analytics:stats');
    });

    it('AnalyticsCacheKeys.reactions should generate correct format', () => {
      expect(AnalyticsCacheKeys.reactions(7)).toBe('analytics:reactions:7d');
    });

    it('AnalyticsCacheKeys.growth should generate correct format', () => {
      expect(AnalyticsCacheKeys.growth(14)).toBe('analytics:growth:14d');
    });

    it('AnalyticsCacheKeys.users should generate correct format', () => {
      expect(AnalyticsCacheKeys.users(30)).toBe('analytics:users:30d');
    });

    it('AnalyticsCacheKeys.activity should generate correct format', () => {
      expect(AnalyticsCacheKeys.activity(7)).toBe('analytics:activity:7d');
    });

    it('ViewsCacheKeys.confession should generate correct format', () => {
      expect(ViewsCacheKeys.confession('uuid-123')).toBe(
        'views:confession:uuid-123',
      );
    });

    it('ViewsCacheKeys.user should generate correct format', () => {
      expect(ViewsCacheKeys.user('uuid-456')).toBe('views:user:uuid-456');
    });

    it('UserCacheKeys.profile should generate correct format', () => {
      expect(UserCacheKeys.profile('uuid-789')).toBe(
        'user:profile:uuid-789',
      );
    });

    it('UserCacheKeys.settings should generate correct format', () => {
      expect(UserCacheKeys.settings('uuid-789')).toBe(
        'user:settings:uuid-789',
      );
    });
  });

  describe('InvalidationPrefixes - deterministic prefix construction', () => {
    it('should have all analytics prefixes', () => {
      expect(InvalidationPrefixes.analyticsTrending).toBe(
        'analytics:trending',
      );
      expect(InvalidationPrefixes.analyticsStats).toBe('analytics:stats');
      expect(InvalidationPrefixes.analyticsReactions).toBe(
        'analytics:reactions',
      );
      expect(InvalidationPrefixes.analyticsGrowth).toBe('analytics:growth');
      expect(InvalidationPrefixes.analyticsUsers).toBe('analytics:users');
      expect(InvalidationPrefixes.analyticsActivity).toBe(
        'analytics:activity',
      );
    });

    it('should have all views prefixes', () => {
      expect(InvalidationPrefixes.viewsConfession).toBe('views:confession');
      expect(InvalidationPrefixes.viewsUser).toBe('views:user');
    });

    it('should have user profile prefix', () => {
      expect(InvalidationPrefixes.userProfile).toBe('user:profile');
    });

    it('prefixes should match key builder output', () => {
      const trendingKey = AnalyticsCacheKeys.trending(7);
      expect(trendingKey.startsWith(InvalidationPrefixes.analyticsTrending)).toBe(true);

      const confessionViewKey = ViewsCacheKeys.confession('abc');
      expect(confessionViewKey.startsWith(InvalidationPrefixes.viewsConfession)).toBe(true);

      const userProfileKey = UserCacheKeys.profile('abc');
      expect(userProfileKey.startsWith(InvalidationPrefixes.userProfile)).toBe(true);
    });
  });

  describe('Cross-namespace isolation', () => {
    const analyticsPrefixes = [
      InvalidationPrefixes.analyticsTrending,
      InvalidationPrefixes.analyticsStats,
      InvalidationPrefixes.analyticsReactions,
      InvalidationPrefixes.analyticsGrowth,
      InvalidationPrefixes.analyticsUsers,
      InvalidationPrefixes.analyticsActivity,
    ];

    it('analytics prefixes should not overlap with views prefixes', () => {
      for (const prefix of analyticsPrefixes) {
        expect(prefix.startsWith('views:')).toBe(false);
        expect(prefix.startsWith('user:')).toBe(false);
      }
    });

    it('views prefixes should not overlap with analytics prefixes', () => {
      expect(
        InvalidationPrefixes.viewsConfession.startsWith('analytics:'),
      ).toBe(false);
      expect(
        InvalidationPrefixes.viewsUser.startsWith('analytics:'),
      ).toBe(false);
    });

    it('user profile prefix should not overlap with analytics or views', () => {
      expect(
        InvalidationPrefixes.userProfile.startsWith('analytics:'),
      ).toBe(false);
      expect(
        InvalidationPrefixes.userProfile.startsWith('views:'),
      ).toBe(false);
    });

    it('different analytics entity prefixes should be distinct', () => {
      const uniquePrefixes = new Set(analyticsPrefixes);
      expect(uniquePrefixes.size).toBe(analyticsPrefixes.length);
    });

    it('all keys in analytics namespace should start with "analytics:"', () => {
      for (const prefix of analyticsPrefixes) {
        expect(prefix.startsWith('analytics:')).toBe(true);
      }
    });
  });

  describe('CacheService.invalidateSegment', () => {
    let cacheService: CacheService;
    let mockCacheManager: Record<string, any>;

    beforeEach(async () => {
      mockCacheManager = {};

      const mockCacheInstance = {
        get: jest.fn((key: string) => Promise.resolve(mockCacheManager[key] || null)),
        set: jest.fn((key: string, value: any) => {
          mockCacheManager[key] = value;
          return Promise.resolve();
        }),
        del: jest.fn((key: string) => {
          delete mockCacheManager[key];
          return Promise.resolve();
        }),
        store: {
          keys: jest.fn((pattern: string) => {
            const prefix = pattern.replace(/\*$/, '');
            return Promise.resolve(
              Object.keys(mockCacheManager).filter((k) => k.startsWith(prefix)),
            );
          }),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheInstance,
          },
          {
            provide: CacheDiagnosticsService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
              recordInvalidation: jest.fn(),
            },
          },
        ],
      }).compile();

      cacheService = module.get<CacheService>(CacheService);
    });

    it('should invalidate keys matching the prefix', async () => {
      mockCacheManager['analytics:trending:7d'] = { data: 'trending7' };
      mockCacheManager['analytics:trending:30d'] = { data: 'trending30' };
      mockCacheManager['analytics:stats'] = { data: 'stats' };

      const evicted = await cacheService.invalidateSegment(
        'analytics:trending',
        'test invalidation',
      );

      expect(evicted).toBe(2);
      expect(mockCacheManager['analytics:trending:7d']).toBeUndefined();
      expect(mockCacheManager['analytics:trending:30d']).toBeUndefined();
      expect(mockCacheManager['analytics:stats']).toBeDefined();
    });

    it('should not invalidate keys in other namespaces', async () => {
      mockCacheManager['analytics:trending:7d'] = { data: 'trending7' };
      mockCacheManager['user:profile:uuid-1'] = { data: 'profile1' };
      mockCacheManager['views:confession:uuid-1'] = { data: 'views1' };

      const evicted = await cacheService.invalidateSegment(
        'analytics:trending',
        'cross-namespace isolation test',
      );

      expect(evicted).toBe(1);
      expect(mockCacheManager['analytics:trending:7d']).toBeUndefined();
      expect(mockCacheManager['user:profile:uuid-1']).toBeDefined();
      expect(mockCacheManager['views:confession:uuid-1']).toBeDefined();
    });

    it('should return 0 when no keys match the prefix', async () => {
      mockCacheManager['user:profile:uuid-1'] = { data: 'profile1' };

      const evicted = await cacheService.invalidateSegment(
        'analytics:nonexistent',
        'empty prefix test',
      );

      expect(evicted).toBe(0);
    });

    it('should handle empty cache', async () => {
      const evicted = await cacheService.invalidateSegment(
        'analytics:trending',
        'empty cache test',
      );

      expect(evicted).toBe(0);
    });

    it('should invalidate all keys across different durations in same namespace', async () => {
      mockCacheManager['analytics:reactions:7d'] = { data: 'r7' };
      mockCacheManager['analytics:reactions:14d'] = { data: 'r14' };
      mockCacheManager['analytics:reactions:30d'] = { data: 'r30' };

      const evicted = await cacheService.invalidateSegment(
        'analytics:reactions',
        'reactions invalidation',
      );

      expect(evicted).toBe(3);
      expect(mockCacheManager['analytics:reactions:7d']).toBeUndefined();
      expect(mockCacheManager['analytics:reactions:14d']).toBeUndefined();
      expect(mockCacheManager['analytics:reactions:30d']).toBeUndefined();
    });

    it('should only invalidate the matching prefix, not sibling prefixes', async () => {
      mockCacheManager['analytics:trending:7d'] = { data: 't7' };
      mockCacheManager['analytics:stats'] = { data: 's' };
      mockCacheManager['analytics:reactions:7d'] = { data: 'r7' };

      const evicted = await cacheService.invalidateSegment(
        'analytics:trending',
        'selective invalidation',
      );

      expect(evicted).toBe(1);
      expect(mockCacheManager['analytics:trending:7d']).toBeUndefined();
      expect(mockCacheManager['analytics:stats']).toBeDefined();
      expect(mockCacheManager['analytics:reactions:7d']).toBeDefined();
    });
  });

  describe('CacheService with missing backend', () => {
    it('should handle invalidateSegment when store does not support keys', async () => {
      const mockCacheInstance = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        store: {}, // No keys method
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheInstance,
          },
          {
            provide: CacheDiagnosticsService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
            },
          },
        ],
      }).compile();

      const service = module.get<CacheService>(CacheService);

      const evicted = await service.invalidateSegment(
        'analytics:trending',
        'missing backend test',
      );

      expect(evicted).toBe(0);
    });

    it('should handle errors in invalidateSegment gracefully', async () => {
      const mockCacheInstance = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        store: {
          keys: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheInstance,
          },
          {
            provide: CacheDiagnosticsService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
            },
          },
        ],
      }).compile();

      const service = module.get<CacheService>(CacheService);

      const evicted = await service.invalidateSegment(
        'analytics:trending',
        'error handling test',
      );

      expect(evicted).toBe(0);
    });
  });

  describe('Cache diagnostics invalidation tracking', () => {
    it('should record invalidation event when diagnostics enabled', async () => {
      const mockRecordInvalidation = jest.fn();
      const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        store: {
          keys: jest.fn().mockResolvedValue(['analytics:trending:7d']),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
          {
            provide: CacheDiagnosticsService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(true),
              recordInvalidation: mockRecordInvalidation,
            },
          },
        ],
      }).compile();

      const service = module.get<CacheService>(CacheService);

      await service.invalidateSegment('analytics:trending', 'diagnostics test');

      expect(mockRecordInvalidation).toHaveBeenCalledWith(
        'analytics:trending',
        1,
        'diagnostics test',
        expect.any(Number),
      );
    });

    it('should not record when diagnostics disabled', async () => {
      const mockRecordInvalidation = jest.fn();
      const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        store: {
          keys: jest.fn().mockResolvedValue(['analytics:trending:7d']),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
          {
            provide: CacheDiagnosticsService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
              recordInvalidation: mockRecordInvalidation,
            },
          },
        ],
      }).compile();

      const service = module.get<CacheService>(CacheService);

      await service.invalidateSegment('analytics:trending', 'no diagnostics');

      expect(mockRecordInvalidation).not.toHaveBeenCalled();
    });
  });
});
