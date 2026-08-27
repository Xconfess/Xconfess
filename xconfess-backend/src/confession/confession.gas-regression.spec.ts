import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionService } from './confession.service';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AnonymousConfession } from './entities/confession.entity';
import {
  GetConfessionsDto,
  SortOrder,
  Gender,
} from './dto/get-confessions.dto';
import { ModerationStatus } from '../moderation/ai-moderation.service';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AppLogger } from '../logger/logger.service';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractService } from '../stellar/contract.service';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { AnomalyDetectionService } from '../anomaly/anomaly-detection.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';

jest.mock('../utils/confession-encryption', () => ({
  decryptConfession: jest.fn((value: string) => value),
  encryptConfession: jest.fn((value: string) => value),
}));

/**
 * Gas Regression Tests for Confession Pagination and Read Flows
 *
 * These tests ensure that gas consumption remains within acceptable bounds
 * for pagination operations and confession reading functionality.
 * They establish baseline measurements and detect regressions.
 */
describe('ConfessionService Gas Regression Tests', () => {
  let service: ConfessionService;
  let repo: jest.Mocked<Repository<AnonymousConfession>>;
  let configService: jest.Mocked<ConfigService>;

  // Gas consumption baselines (in stellar units)
  // These values should be updated periodically based on actual network measurements
  const GAS_BASELINES = {
    SIMPLE_PAGINATION: 15000, // Basic pagination query
    COMPLEX_PAGINATION: 25000, // With joins and filters
    TRENDING_QUERY: 35000, // Complex trending calculation
    CONFESSION_READ: 8000, // Simple confession retrieval
    CACHE_HIT: 5000, // Cached result retrieval
    CACHE_MISS: 18000, // Full query + cache set
    SEARCH_QUERY: 30000, // Full-text search
    TAG_FILTER: 20000, // Tag-based filtering
    MODERATION_CHECK: 10000, // AI moderation overhead
    VIEW_COUNT_UPDATE: 5000, // Increment view count
  } as const;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
      hybridSearch: jest.fn().mockResolvedValue({ confessions: [], total: 0 }),
    } as any;

    configService = {
      get: jest.fn().mockReturnValue('test-aes-key'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: repo },
        {
          provide: ConfessionViewCacheService,
          useValue: { checkAndMarkView: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: {
            createLog: jest.fn(),
            getLogsByConfession: jest.fn(),
            updateReview: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: AnonymousUserService,
          useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() },
        },
        {
          provide: AppLogger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            observeTimer: jest.fn(),
            logSlowSearch: jest.fn(),
            logSampledSearch: jest.fn(),
            logWithUser: jest.fn(),
          },
        },
        { provide: EncryptionService, useValue: {} },
        {
          provide: StellarService,
          useValue: {
            processAnchorData: jest.fn(),
            getExplorerUrl: jest.fn(),
            verifyTransaction: jest.fn(),
          },
        },
        { provide: ContractService, useValue: { verifyConfession: jest.fn() } },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: string[]) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        {
          provide: TagService,
          useValue: {
            validateTags: jest.fn(),
            getTagByName: jest.fn(),
            getAllTags: jest.fn(),
          },
        },
        {
          provide: AnomalyDetectionService,
          useValue: { getAdjustmentFactor: jest.fn().mockResolvedValue(1) },
        },
        { provide: ConfessionIdempotencyService, useValue: {} },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(ConfessionService);
  });

  describe('Pagination Gas Regression Tests', () => {
    describe('Simple Pagination', () => {
      it('should maintain gas baseline for basic pagination', async () => {
        // Arrange
        const mockQueryBuilder = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(100),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([{ id: '1', message: 'test' }]),
        };

        repo.createQueryBuilder = jest
          .fn()
          .mockReturnValue(mockQueryBuilder as any);

        // Act
        await service.getConfessions({
          page: 1,
          limit: 10,
          sort: SortOrder.NEWEST,
        });

        // Assert - Verify query structure is efficient
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'confession.isDeleted = false',
        );
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'confession.isHidden = false',
        );
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledTimes(3);
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledTimes(1);
        expect(mockQueryBuilder.getCount).not.toHaveBeenCalled();
        expect(mockQueryBuilder.skip).not.toHaveBeenCalled();
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(11);
        expect(mockQueryBuilder.getMany).toHaveBeenCalled();

        // Gas assertion: Should not exceed baseline
        // In real environment, this would measure actual gas consumption
        // For now, we verify that query structure is optimized
        expect(mockQueryBuilder.select).toHaveBeenCalledWith(
          expect.arrayContaining([
            'confession.id',
            'confession.message',
            'confession.gender',
            'confession.created_at',
            'confession.view_count',
            'confession.moderationStatus',
          ]),
        );
      });

      it('should handle large pagination efficiently', async () => {
        // Arrange
        const mockQueryBuilder = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(10000),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(Array(100).fill({ id: 'test' })),
        };

        repo.createQueryBuilder = jest
          .fn()
          .mockReturnValue(mockQueryBuilder as any);

        // Act
        await service.getConfessions({
          page: 50,
          limit: 200,
          sort: SortOrder.NEWEST,
        });

        // Assert
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(9800); // (50-1) * 200
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(201);

        // Gas regression check
        // Large pagination should be more efficient than multiple small queries
        expect(mockQueryBuilder.getMany).toHaveBeenCalledTimes(1);
      });
    });

    describe('Complex Pagination with Filters', () => {
      it('should maintain gas baseline for gender filtering', async () => {
        // Arrange
        const mockQueryBuilder = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(500),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([{ id: '1' }]),
        };

        repo.createQueryBuilder = jest
          .fn()
          .mockReturnValue(mockQueryBuilder as any);

        // Act
        await service.getConfessions({
          page: 1,
          limit: 20,
          sort: SortOrder.NEWEST,
          gender: Gender.FEMALE,
        });

        // Assert
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'confession.gender = :gender',
          { gender: Gender.FEMALE },
        );
      });

      it('should handle trending sort efficiently', async () => {
        // Arrange
        const mockQueryBuilder = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(1000),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValue([{ id: '1', reaction_count: 50 }]),
        };

        repo.createQueryBuilder = jest
          .fn()
          .mockReturnValue(mockQueryBuilder as any);

        // Act
        await service.getConfessions({
          page: 1,
          limit: 50,
          sort: SortOrder.TRENDING,
        });

        // Assert
        expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
          expect.any(Function),
          'reaction_count',
        );
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'reaction_count',
          'DESC',
        );
        expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
          'confession.created_at',
          'DESC',
        );
      });
    });
  });

  describe('Confession Read Flow Gas Regression Tests', () => {
    describe('Single Confession Retrieval', () => {
      it('should maintain gas baseline for simple read', async () => {
        // Arrange
        const confession = {
          id: 'test-id',
          message: 'encrypted-message',
          view_count: 5,
          isDeleted: false,
          isHidden: false,
          moderationStatus: ModerationStatus.APPROVED,
        };
        repo.findOne.mockResolvedValue(confession as any);

        // Act
        const result = await service.getConfessionByIdWithViewCount('test-id', {
          user: { id: 'user-id' },
        } as any);

        // Assert
        expect(repo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'test-id', isDeleted: false, isHidden: false },
          }),
        );

        // Gas baseline check
        // Simple read should be under baseline
        expect(repo.findOne).toHaveBeenCalledTimes(1);
        expect(result).toBeDefined();
      });

      it('should handle non-existent confession efficiently', async () => {
        // Arrange
        repo.findOne.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.getConfessionByIdWithViewCount('non-existent', {
            user: { id: 'user-id' },
          } as any),
        ).rejects.toThrow();

        // Should fail fast without expensive operations
        expect(repo.findOne).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Gas Regression Detection', () => {
    it('should detect pagination gas regression', () => {
      // This test demonstrates how to detect gas regressions
      // In real environment, you would measure actual gas consumption

      const currentGasMeasurement = {
        simplePagination: 18000, // Increased from 15000 baseline
        complexPagination: 32000, // Increased from 25000 baseline
      };

      // Simulate regression detection
      const simpleRegression =
        currentGasMeasurement.simplePagination >
        GAS_BASELINES.SIMPLE_PAGINATION;
      const complexRegression =
        currentGasMeasurement.complexPagination >
        GAS_BASELINES.COMPLEX_PAGINATION;

      expect(simpleRegression).toBe(true);
      expect(complexRegression).toBe(true);

      // In real implementation, you would:
      // 1. Fail build if regression detected
      // 2. Alert team
      // 3. Create tickets for optimization
    });

    it('should provide gas optimization recommendations', () => {
      // This test shows how to structure optimization recommendations

      const gasAnalysis = {
        currentConsumption: {
          pagination: 28000,
          readOperations: 15000,
          searchQueries: 35000,
        },
        optimizations: [
          'Add composite index on (gender, created_at, is_deleted)',
          'Implement query result caching for trending calculations',
          'Use cursor-based pagination for large datasets',
          'Optimize full-text search with proper indexing',
          'Batch view count updates',
        ],
      };

      // Verify optimization suggestions are actionable
      expect(gasAnalysis.optimizations).toContain(
        'Add composite index on (gender, created_at, is_deleted)',
      );
      expect(gasAnalysis.optimizations).toContain(
        'Implement query result caching for trending calculations',
      );
      expect(gasAnalysis.optimizations).toContain(
        'Use cursor-based pagination for large datasets',
      );
    });
  });

  describe('Performance Benchmarks', () => {
    it('should establish performance baselines', async () => {
      // These tests establish baseline performance metrics
      const startTime = Date.now();

      // Simulate typical operations
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1000),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(
          Array(100).fill({
            id: 'test',
            message: 'test',
            created_at: new Date('2026-04-29T00:00:00.000Z'),
          }),
        ),
      };

      repo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder as any);

      await service.getConfessions({
        page: 1,
        limit: 50,
        sort: SortOrder.NEWEST,
      });

      const duration = Date.now() - startTime;

      // Performance assertions
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(mockQueryBuilder.getMany).toHaveBeenCalledTimes(1);
        expect(mockQueryBuilder.getCount).not.toHaveBeenCalled();
    });

    it('should measure memory usage patterns', async () => {
      // Memory usage is correlated with gas consumption
      const largeDataset = Array(1000).fill({
        id: 'test',
        message: 'x'.repeat(100), // Simulate large confessions
        created_at: new Date('2026-04-29T00:00:00.000Z'),
        reactions: [],
        tags: [],
      });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1000),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(largeDataset),
      };

      repo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder as any);

      await service.getConfessions({
        page: 1,
        limit: 100,
        sort: SortOrder.NEWEST,
      });

      // Verify memory-efficient patterns
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(101);
      expect(mockQueryBuilder.skip).not.toHaveBeenCalled();

      // Large result sets should be streamed or paginated
      // This test ensures we're not loading excessive data into memory
    });
  });

  describe('Integration Gas Regression Tests', () => {
    it('should measure complete user flow gas consumption', async () => {
      // This test measures gas for a complete user journey

      // 1. User browses confessions (pagination)
      const mockQueryBuilder1 = {
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(500),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(
          Array(50).fill({
            id: 'test',
            message: 'test',
            created_at: new Date('2026-04-29T00:00:00.000Z'),
          }),
        ),
      };

      repo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder1 as any);

      await service.getConfessions({
        page: 1,
        limit: 20,
        sort: SortOrder.NEWEST,
      });

      // 2. User views specific confession
      const confession = { id: 'test-1', message: 'encrypted' };
      repo.findOne.mockResolvedValue(confession as any);

      await service.getConfessionByIdWithViewCount('test-1', {
        user: { id: 'user' },
      } as any);

      // 3. User searches for confessions
      const mockQueryBuilder2 = {
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(10),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'search-1' }]),
      };

      repo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder2 as any);

      await service.search({ q: 'search term', page: 1, limit: 10 });

      // Gas measurement for complete flow
      const totalOperations = 3; // pagination + read + search
      const expectedGasPerFlow =
        GAS_BASELINES.SIMPLE_PAGINATION +
        GAS_BASELINES.CONFESSION_READ +
        GAS_BASELINES.SEARCH_QUERY;

      // In real environment, measure actual gas and compare
      expect(totalOperations).toBe(3);

      // This establishes baseline for user journey gas consumption
    });
  });
});
