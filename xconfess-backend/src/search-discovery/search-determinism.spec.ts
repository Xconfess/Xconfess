import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchDeterminismService } from './search-determinism.service';
import { AnonymousConfession } from '../confession/entities/confession.entity';

describe('SearchDeterminismService', () => {
  let service: SearchDeterminismService;
  let confessionRepository: Repository<AnonymousConfession>;

  beforeEach(async () => {
    const mockConfessionRepository = {
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SearchDeterminismService,
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: mockConfessionRepository,
        },
      ],
    }).compile();

    service = module.get<SearchDeterminismService>(SearchDeterminismService);
    confessionRepository = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );
  });

  describe('initializeTiebreakers', () => {
    it('should initialize tiebreakers for confessions', async () => {
      const confessions = [
        {
          id: 'conf-1',
          created_at: new Date(),
          searchScoreTiebreaker: null,
        } as AnonymousConfession,
      ];

      jest.spyOn(confessionRepository, 'find').mockResolvedValue(confessions);
      jest.spyOn(confessionRepository, 'save').mockResolvedValue(confessions);

      await service.initializeTiebreakers();

      expect(confessionRepository.save).toHaveBeenCalled();
    });

    it('should skip if no confessions need initialization', async () => {
      jest.spyOn(confessionRepository, 'find').mockResolvedValue([]);

      await service.initializeTiebreakers();

      expect(confessionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('ensureTiebreakerForNew', () => {
    it('should generate tiebreaker for new confession', async () => {
      const confession = {
        id: 'conf-1',
        created_at: new Date(),
        searchScoreTiebreaker: null,
      } as AnonymousConfession;

      await service.ensureTiebreakerForNew(confession);

      expect(confession.searchScoreTiebreaker).toBeDefined();
      expect(confession.searchScoreTiebreaker).toBeGreaterThan(0);
    });

    it('should preserve existing tiebreaker', async () => {
      const confession = {
        id: 'conf-1',
        created_at: new Date(),
        searchScoreTiebreaker: 12345,
      } as AnonymousConfession;

      await service.ensureTiebreakerForNew(confession);

      expect(confession.searchScoreTiebreaker).toBe(12345);
    });
  });

  describe('buildDeterministicOrderBy', () => {
    it('should build order clause with tiebreaker', () => {
      const orderBy = service.buildDeterministicOrderBy('relevance DESC', true);

      expect(orderBy).toContain('relevance DESC');
      expect(orderBy).toContain('search_score_tiebreaker');
    });

    it('should skip tiebreaker when disabled', () => {
      const orderBy = service.buildDeterministicOrderBy('relevance DESC', false);

      expect(orderBy).toBe('relevance DESC');
    });
  });

  describe('getDeterministicResults', () => {
    it('should return stable ordered results', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'conf-1', message: 'test' } as AnonymousConfession,
        ]),
      };

      jest
        .spyOn(confessionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQuery as any);

      const results = await service.getDeterministicResults('query', 40, 0);

      expect(results).toHaveLength(1);
      expect(mockQuery.orderBy).toHaveBeenCalledWith(
        'confession.searchScoreTiebreaker',
        'ASC',
      );
    });
  });

  describe('validatePaginationConsistency', () => {
    it('should detect duplicates in pagination', async () => {
      const confessions = [
        { id: 'conf-1' } as AnonymousConfession,
        { id: 'conf-2' } as AnonymousConfession,
        { id: 'conf-1' } as AnonymousConfession, // Duplicate
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(confessions),
      };

      jest
        .spyOn(confessionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQuery as any);

      const result = await service.validatePaginationConsistency('query');

      expect(result.isConsistent).toBe(false);
      expect(result.duplicates.length).toBeGreaterThan(0);
    });

    it('should validate consistent pagination', async () => {
      const confessions = [
        { id: 'conf-1' } as AnonymousConfession,
        { id: 'conf-2' } as AnonymousConfession,
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn()
          .mockResolvedValueOnce(confessions)
          .mockResolvedValueOnce(confessions),
      };

      jest
        .spyOn(confessionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQuery as any);

      const result = await service.validatePaginationConsistency('query', 2, 2);

      expect(result.isConsistent).toBe(true);
    });
  });

  describe('tiebreaker generation', () => {
    it('should generate deterministic tiebreakers for same confession', async () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const id = 'test-id-12345678';

      const confession1 = {
        id,
        created_at: date,
        searchScoreTiebreaker: null,
      } as AnonymousConfession;

      const confession2 = {
        id,
        created_at: date,
        searchScoreTiebreaker: null,
      } as AnonymousConfession;

      await service.ensureTiebreakerForNew(confession1);
      await service.ensureTiebreakerForNew(confession2);

      expect(confession1.searchScoreTiebreaker).toBe(
        confession2.searchScoreTiebreaker,
      );
    });

    it('should generate different tiebreakers for different confessions', async () => {
      const date = new Date('2024-01-01T00:00:00Z');

      const confession1 = {
        id: 'conf-1',
        created_at: date,
        searchScoreTiebreaker: null,
      } as AnonymousConfession;

      const confession2 = {
        id: 'conf-2',
        created_at: date,
        searchScoreTiebreaker: null,
      } as AnonymousConfession;

      await service.ensureTiebreakerForNew(confession1);
      await service.ensureTiebreakerForNew(confession2);

      expect(confession1.searchScoreTiebreaker).not.toBe(
        confession2.searchScoreTiebreaker,
      );
    });
  });
});
