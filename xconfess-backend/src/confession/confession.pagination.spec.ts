import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionService } from './confession.service';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AppLogger } from '../logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractService } from '../stellar/contract.service';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { SortOrder } from './dto/get-confessions.dto';
import { encryptConfession } from '../utils/confession-encryption';
import { encodeCursor } from '../common/pagination';
import { AnomalyDetectionService } from '../anomaly/anomaly-detection.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';

jest.mock('../utils/confession-encryption', () => ({
  decryptConfession: jest.fn((value: string) => value ?? ''),
  encryptConfession: jest.fn((value: string) => value),
}));

const anomalyDetectionProvider = {
  provide: AnomalyDetectionService,
  useValue: { getAdjustmentFactor: jest.fn().mockResolvedValue(1) },
};

const idempotencyServiceProvider = {
  provide: ConfessionIdempotencyService,
  useValue: {
    computePayloadHash: jest.fn(),
    check: jest.fn(),
    commitSuccess: jest.fn(),
    commitFailure: jest.fn(),
  },
};

const AES_KEY = '12345678901234567890123456789012';

function makeConfession(id: string, message = 'test', date?: Date) {
  return {
    id,
    message: encryptConfession(message, AES_KEY),
    created_at: date ?? new Date('2026-01-01T00:00:00.000Z'),
    reactions: [],
  };
}

function buildProviders(qb: any, cacheService: any) {
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    update: jest.fn(),
    hybridSearch: jest.fn(),
    fullTextSearch: jest.fn(),
  };

  return [
    ConfessionService,
    { provide: AnonymousConfessionRepository, useValue: repo },
    { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn() } },
    { provide: AiModerationService, useValue: { moderateContent: jest.fn() } },
    {
      provide: ModerationRepositoryService,
      useValue: { createLog: jest.fn(), getLogsByConfession: jest.fn(), updateReview: jest.fn() },
    },
    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
    {
      provide: AnonymousUserService,
      useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() },
    },
    { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(AES_KEY) } },
    { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() } },
    { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
    {
      provide: StellarService,
      useValue: { processAnchorData: jest.fn(), getExplorerUrl: jest.fn(), verifyTransaction: jest.fn() },
    },
    { provide: ContractService, useValue: { verifyConfession: jest.fn() } },
    { provide: CacheService, useValue: cacheService },
    { provide: TagService, useValue: { validateTags: jest.fn() } },
    anomalyDetectionProvider,
    idempotencyServiceProvider,
  ];
}

// ─── Feed (getConfessions) ────────────────────────────────────────────────────

describe('ConfessionService — feed pagination', () => {
  let service: ConfessionService;
  let qb: any;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    const cacheService = {
      buildKey: jest.fn((...parts: any[]) => parts.join(':')),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: buildProviders(qb, cacheService),
    }).compile();

    service = module.get(ConfessionService);
  });

  describe('first page', () => {
    it('returns items up to limit with hasMore=false when results equal limit', async () => {
      qb.getMany.mockResolvedValue([makeConfession('1'), makeConfession('2')]);

      const result = await service.getConfessions({ limit: 2, sort: SortOrder.NEWEST });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.limit).toBe(2);
    });

    it('returns hasMore=true and nextCursor when more items exist beyond limit', async () => {
      // getMany returns limit+1 items (3) when limit=2
      qb.getMany.mockResolvedValue([
        makeConfession('1'),
        makeConfession('2'),
        makeConfession('3'),
      ]);

      const result = await service.getConfessions({ limit: 2, sort: SortOrder.NEWEST });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('fetches limit+1 items to probe for a next page', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.getConfessions({ limit: 10, sort: SortOrder.NEWEST });

      expect(qb.take).toHaveBeenCalledWith(11);
    });
  });

  describe('middle page via cursor', () => {
    it('applies cursor andWhere condition and returns paged items', async () => {
      const cursorDate = '2026-01-01T00:00:00.000Z';
      const cursor = encodeCursor({ id: 'c1', created_at: cursorDate });
      qb.getMany.mockResolvedValue([makeConfession('2'), makeConfession('3')]);

      const result = await service.getConfessions({ cursor, limit: 5, sort: SortOrder.NEWEST });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('confession.created_at'),
        expect.objectContaining({ createdAt: cursorDate, id: 'c1' }),
      );
      expect(result.data).toHaveLength(2);
    });
  });

  describe('middle page via offset', () => {
    it('applies skip for page > 1 and no cursor', async () => {
      qb.getMany.mockResolvedValue([makeConfession('x')]);

      await service.getConfessions({ page: 3, limit: 5, sort: SortOrder.NEWEST });

      expect(qb.skip).toHaveBeenCalledWith(10); // (3-1) * 5
    });
  });

  describe('empty page', () => {
    it('returns empty data, hasMore=false, nextCursor=null', async () => {
      qb.getMany.mockResolvedValue([]);

      const result = await service.getConfessions({ limit: 10, sort: SortOrder.NEWEST });

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('terminal page', () => {
    it('returns hasMore=false and null nextCursor when fewer items than limit', async () => {
      qb.getMany.mockResolvedValue([makeConfession('last-1'), makeConfession('last-2')]);

      const result = await service.getConfessions({ limit: 10, sort: SortOrder.NEWEST });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(2);
    });
  });

  describe('response metadata consistency', () => {
    it('always includes data, hasMore, nextCursor, and limit fields', async () => {
      qb.getMany.mockResolvedValue([makeConfession('a')]);

      const result = await service.getConfessions({ limit: 5 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('limit');
      expect(result.limit).toBe(5);
    });
  });
});

// ─── Search (hybrid + fullText) ───────────────────────────────────────────────

function buildSearchProviders(repoValue: any) {
  return [
    ConfessionService,
    { provide: AnonymousConfessionRepository, useValue: repoValue },
    { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn() } },
    { provide: AiModerationService, useValue: { moderateContent: jest.fn() } },
    { provide: ModerationRepositoryService, useValue: { createLog: jest.fn() } },
    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
    {
      provide: AnonymousUserService,
      useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() },
    },
    {
      provide: AppLogger,
      useValue: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
        emitEvent: jest.fn(),
        emitWarningEvent: jest.fn(),
        observeTimer: jest.fn(),
        logSlowSearch: jest.fn(),
        logSampledSearch: jest.fn(),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn((key: string, def?: any) => {
          if (key === 'app.searchSampleRate') return 0;
          if (key === 'app.searchSlowQueryThresholdMs') return 99999;
          if (key === 'app.confessionAesKey') return AES_KEY;
          return def;
        }),
      },
    },
    { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
    {
      provide: StellarService,
      useValue: { processAnchorData: jest.fn(), getExplorerUrl: jest.fn(), verifyTransaction: jest.fn() },
    },
    { provide: ContractService, useValue: { verifyConfession: jest.fn() } },
    {
      provide: CacheService,
      useValue: {
        buildKey: jest.fn((...p: any[]) => p.join(':')),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        delPattern: jest.fn(),
      },
    },
    { provide: TagService, useValue: { validateTags: jest.fn() } },
    anomalyDetectionProvider,
    idempotencyServiceProvider,
  ];
}

describe('ConfessionService — search pagination', () => {
  let service: ConfessionService;
  let repository: AnonymousConfessionRepository;

  beforeEach(async () => {
    const repoValue = {
      hybridSearch: jest.fn(),
      fullTextSearch: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: buildSearchProviders(repoValue),
    }).compile();

    service = module.get(ConfessionService);
    repository = module.get(AnonymousConfessionRepository);
  });

  describe('hybrid search', () => {
    it('first page: meta reflects page=1 and correct totalPages', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({
        confessions: Array(10).fill({ id: '1', message: 'x', reactions: [] }),
        total: 25,
      } as any);

      const result = await service.search({ q: 'test', page: 1, limit: 10 });

      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3); // ceil(25/10)
      expect(result.data).toHaveLength(10);
    });

    it('middle page: repository called with correct page number', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({ confessions: [], total: 30 } as any);

      await service.search({ q: 'test', page: 2, limit: 10 });

      expect(repository.hybridSearch).toHaveBeenCalledWith('test', 2, 10, expect.any(Object));
    });

    it('empty page: data=[], meta.total=0, meta.totalPages=0', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({ confessions: [], total: 0 } as any);

      const result = await service.search({ q: 'nothing', page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('terminal page: meta reflects last page of results', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({
        confessions: Array(5).fill({ id: '1' }),
        total: 25,
      } as any);

      const result = await service.search({ q: 'test', page: 3, limit: 10 });

      expect(result.meta.page).toBe(3);
      expect(result.meta.totalPages).toBe(3);
    });

    it('response metadata is consistent: data, meta.{page,limit,total,totalPages,searchTerm}', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({ confessions: [], total: 0 } as any);

      const result = await service.search({ q: 'check', page: 1, limit: 5 });

      expect(result).toHaveProperty('data');
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 5,
        total: 0,
        totalPages: 0,
        searchTerm: 'check',
      });
    });

    it('deterministic: same query params produce identical meta on repeated calls', async () => {
      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue({ confessions: [{ id: '1' }], total: 1 } as any);

      const r1 = await service.search({ q: 'stable', page: 1, limit: 5 });
      const r2 = await service.search({ q: 'stable', page: 1, limit: 5 });

      expect(r1.meta).toEqual(r2.meta);
      expect(r1.data).toHaveLength(r2.data.length);
    });
  });

  describe('fullTextSearch', () => {
    it('first page: returns data with meta.page=1 and searchType=fulltext', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockResolvedValue({ confessions: [{ id: '1' }], total: 1 } as any);

      const result = await service.fullTextSearch({ q: 'work', page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.searchType).toBe('fulltext');
    });

    it('middle page: repository called with correct page', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockResolvedValue({ confessions: [], total: 20 } as any);

      await service.fullTextSearch({ q: 'work', page: 2, limit: 10 });

      expect(repository.fullTextSearch).toHaveBeenCalledWith('work', 2, 10, expect.any(Object));
    });

    it('empty page: data=[], total=0', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockResolvedValue({ confessions: [], total: 0 } as any);

      const result = await service.fullTextSearch({ q: 'missing', page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('terminal page: totalPages = ceil(total/limit)', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockResolvedValue({
        confessions: [{ id: '1' }],
        total: 21,
      } as any);

      const result = await service.fullTextSearch({ q: 'test', page: 3, limit: 10 });

      expect(result.meta.totalPages).toBe(3); // ceil(21/10)
    });

    it('always includes searchType=fulltext in meta', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockResolvedValue({ confessions: [], total: 0 } as any);

      const result = await service.fullTextSearch({ q: 'any', page: 1, limit: 10 });

      expect(result.meta.searchType).toBe('fulltext');
    });

    it('deterministic: same query params produce identical meta on repeated calls', async () => {
      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue({ confessions: [{ id: '1' }], total: 1 } as any);

      const r1 = await service.fullTextSearch({ q: 'stable', page: 1, limit: 5 });
      const r2 = await service.fullTextSearch({ q: 'stable', page: 1, limit: 5 });

      expect(r1.meta).toEqual(r2.meta);
    });
  });
});
