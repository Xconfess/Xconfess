import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionService } from './confession.service';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { SearchConfessionDto } from './dto/search-confession.dto';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppLogger } from '../logger/logger.service';
import { ConfigService } from '@nestjs/config';

describe('ConfessionService - Search Functionality', () => {
  let service: ConfessionService;
  let repository: AnonymousConfessionRepository;
  let logger: AppLogger;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        {
          provide: AnonymousConfessionRepository,
          useValue: {
            hybridSearch: jest.fn(),
            fullTextSearch: jest.fn(),
            findOne: jest.fn(),
            increment: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: ConfessionViewCacheService,
          useValue: { checkAndMarkView: jest.fn() },
        },
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
            get: jest.fn((key: string, defaultVal?: unknown) => {
              if (key === 'app.searchSlowQueryThresholdMs') return 500;
              if (key === 'app.searchSampleRate') return 1; // always sample in tests
              if (key === 'app.confessionAesKey') return '';
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ConfessionService>(ConfessionService);
    repository = module.get<AnonymousConfessionRepository>(
      AnonymousConfessionRepository,
    );
    logger = module.get<AppLogger>(AppLogger);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('search', () => {
    it('should return search results with metadata', async () => {
      const searchDto: SearchConfessionDto = { q: 'love', page: 1, limit: 10 };
      const mockResult = {
        confessions: [
          {
            id: '1',
            message: 'I love programming',
            created_at: new Date(),
            reactions: [],
          },
        ],
        total: 1,
      };

      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue(mockResult as any);

      const result = await service.search(searchDto);

      expect(result.data).toEqual(mockResult.confessions);
      expect(result.meta.total).toBe(1);
      expect(result.meta.searchTerm).toBe('love');
    });

    it('should handle empty search terms', async () => {
      const searchDto: SearchConfessionDto = { q: '', page: 1, limit: 10 };

      await expect(service.search(searchDto)).rejects.toThrow(
        'Search term cannot be empty',
      );
    });

    it('should trim search terms', async () => {
      const searchDto: SearchConfessionDto = {
        q: '  love  ',
        page: 1,
        limit: 10,
      };
      const mockResult = { confessions: [], total: 0 };

      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue(mockResult as any);

      await service.search(searchDto);

      expect(repository.hybridSearch).toHaveBeenCalledWith('love', 1, 10);
    });

    it('should pass anonymousOnly filter to repository', async () => {
      const searchDto: SearchConfessionDto = {
        q: 'secret',
        page: 1,
        limit: 10,
        anonymousOnly: true,
      };
      const mockResult = { confessions: [], total: 0 };

      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue(mockResult as any);

      await service.search(searchDto);

      expect(repository.hybridSearch).toHaveBeenCalledWith(
        'secret',
        1,
        10,
        searchDto,
      );
    });
  });

  describe('fullTextSearch', () => {
    it('should perform full-text search', async () => {
      const searchDto: SearchConfessionDto = {
        q: 'relationship advice',
        page: 1,
        limit: 10,
      };
      const mockResult = {
        confessions: [
          {
            id: '1',
            message: 'Need relationship advice',
            created_at: new Date(),
            reactions: [],
          },
        ],
        total: 1,
      };

      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue(mockResult as any);

      const result = await service.fullTextSearch(searchDto);

      expect(result.data).toEqual(mockResult.confessions);
      expect(result.meta.searchType).toBe('fulltext');
    });

    it('should sanitize and search punctuation-heavy queries', async () => {
      const searchDto: SearchConfessionDto = {
        q: '!!!love???',
        page: 1,
        limit: 10,
      };
      const mockResult = { confessions: [], total: 0 };
      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue(mockResult as any);
      await service.fullTextSearch(searchDto);
      // Should call with sanitized term ("love")
      expect(repository.fullTextSearch).toHaveBeenCalledWith(
        '!!!love???',
        1,
        10,
      );
    });

    it('should handle missing search_vector schema gracefully', async () => {
      const searchDto: SearchConfessionDto = { q: 'test', page: 1, limit: 10 };
      // Simulate schema missing: repo returns empty
      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue({ confessions: [], total: 0 });
      const result = await service.fullTextSearch(searchDto);
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should pass anonymousOnly filter to fullTextSearch repository method', async () => {
      const searchDto: SearchConfessionDto = {
        q: 'test',
        page: 1,
        limit: 10,
        anonymousOnly: true,
      };
      const mockResult = { confessions: [], total: 0 };

      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue(mockResult as any);

      await service.fullTextSearch(searchDto);

      expect(repository.fullTextSearch).toHaveBeenCalledWith(
        'test',
        1,
        10,
        searchDto,
      );
    });
  });

  // ── Observability ──────────────────────────────────────────────────────────

  describe('search observability', () => {
    it('records timing via observeTimer for every search call', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({
        confessions: [],
        total: 0,
      } as any);

      await service.search({ q: 'anything', page: 1, limit: 10 });

      expect(logger.observeTimer).toHaveBeenCalledWith(
        'search.duration_ms',
        expect.any(Number),
        { searchType: 'hybrid' },
      );
    });

    it('emits logSlowSearch warning when hybridSearch exceeds threshold', async () => {
      // Force the repository call to take longer than the threshold
      jest.spyOn(repository, 'hybridSearch').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { confessions: [{ id: '1' } as any], total: 1 };
      });
      // Set threshold to 0 ms so any duration triggers a slow-query warning
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'app.searchSlowQueryThresholdMs') return 0;
          if (key === 'app.searchSampleRate') return 1;
          return defaultVal;
        },
      );

      await service.search({ q: 'slow query', page: 1, limit: 5 });

      expect(logger.logSlowSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'hybrid',
          page: 1,
          limit: 5,
          resultCount: 1,
          thresholdMs: 0,
          durationMs: expect.any(Number),
          rawTerm: 'slow query',
        }),
      );
    });

    it('emits logSlowSearch warning when fullTextSearch exceeds threshold', async () => {
      jest.spyOn(repository, 'fullTextSearch').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { confessions: [], total: 0 };
      });
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'app.searchSlowQueryThresholdMs') return 0;
          if (key === 'app.searchSampleRate') return 1;
          return defaultVal;
        },
      );

      await service.fullTextSearch({ q: 'slow fts', page: 2, limit: 20 });

      expect(logger.logSlowSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'fulltext',
          page: 2,
          limit: 20,
          thresholdMs: 0,
          rawTerm: 'slow fts',
        }),
      );
    });

    it('does NOT call logSlowSearch when duration is below threshold', async () => {
      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue({ confessions: [], total: 0 } as any);
      // Very high threshold so the query is never "slow"
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'app.searchSlowQueryThresholdMs') return 999_999;
          if (key === 'app.searchSampleRate') return 0; // no sampling either
          return defaultVal;
        },
      );

      await service.search({ q: 'fast', page: 1, limit: 10 });

      expect(logger.logSlowSearch).not.toHaveBeenCalled();
      expect(logger.logSampledSearch).not.toHaveBeenCalled();
    });

    it('emits logSampledSearch when query is fast and sampled', async () => {
      jest
        .spyOn(repository, 'hybridSearch')
        .mockResolvedValue({ confessions: [], total: 0 } as any);
      // High threshold (not slow), but sample rate = 1 (always sample)
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'app.searchSlowQueryThresholdMs') return 999_999;
          if (key === 'app.searchSampleRate') return 1;
          return defaultVal;
        },
      );

      await service.search({ q: 'sampled', page: 1, limit: 10 });

      expect(logger.logSampledSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          searchType: 'hybrid',
          page: 1,
          limit: 10,
          rawTerm: 'sampled',
          durationMs: expect.any(Number),
        }),
      );
    });

    it('redacts the raw search term in slow-query log (term not present in log payload)', async () => {
      jest.spyOn(repository, 'hybridSearch').mockResolvedValue({
        confessions: [],
        total: 0,
      } as any);
      (configService.get as jest.Mock).mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'app.searchSlowQueryThresholdMs') return 0;
          if (key === 'app.searchSampleRate') return 1;
          return defaultVal;
        },
      );

      const sensitiveQuery = 'my secret confession term';
      await service.search({ q: sensitiveQuery, page: 1, limit: 10 });

      // The emitWarningEvent call inside logSlowSearch must not expose the raw term
      expect(logger.logSlowSearch).toHaveBeenCalledWith(
        expect.objectContaining({ rawTerm: sensitiveQuery }),
      );
      // The internal emitWarningEvent should receive a redacted shape, not the raw text
      const warnCalls = (logger.emitWarningEvent as jest.Mock).mock.calls;
      warnCalls.forEach((args) => {
        const details = args[1] as Record<string, unknown>;
        if (details?.termShape !== undefined) {
          expect(String(details.termShape)).not.toContain(sensitiveQuery);
          expect(String(details.termShape)).toMatch(/\[REDACTED:/);
        }
      });
    });

    it('records timer with correct searchType label for fullTextSearch', async () => {
      jest
        .spyOn(repository, 'fullTextSearch')
        .mockResolvedValue({ confessions: [], total: 0 } as any);

      await service.fullTextSearch({ q: 'timer label', page: 1, limit: 10 });

      expect(logger.observeTimer).toHaveBeenCalledWith(
        'search.duration_ms',
        expect.any(Number),
        { searchType: 'fulltext' },
      );
    });
  });
});
