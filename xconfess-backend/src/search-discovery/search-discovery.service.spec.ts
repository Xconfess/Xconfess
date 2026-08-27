import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchDiscoveryService } from './search-discovery.service';
import { SavedSearch } from './entities/saved-search.entity';
import { SearchHistory } from './entities/search-history.entity';

describe('SearchDiscoveryService', () => {
  let service: SearchDiscoveryService;
  let savedSearchRepo: jest.Mocked<Repository<SavedSearch>>;
  let searchHistoryRepo: jest.Mocked<Repository<SearchHistory>>;

  beforeEach(async () => {
    savedSearchRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as any;

    searchHistoryRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchDiscoveryService,
        {
          provide: getRepositoryToken(SavedSearch),
          useValue: savedSearchRepo,
        },
        {
          provide: getRepositoryToken(SearchHistory),
          useValue: searchHistoryRepo,
        },
      ],
    }).compile();

    service = module.get<SearchDiscoveryService>(SearchDiscoveryService);
  });

  describe('savePreset', () => {
    it('should save a new preset', async () => {
      savedSearchRepo.findOne.mockResolvedValue(null);
      savedSearchRepo.create.mockImplementation((x) => x as any);
      savedSearchRepo.save.mockImplementation(async (x) => x as any);

      const dto = { name: 'test', filters: { q: 'hello', gender: 'male' } };
      const result = await service.savePreset(1, dto);

      expect(result.name).toBe('test');
      expect(result.filters).toEqual({ gender: 'male' }); // q is normalized out
      expect(savedSearchRepo.create).toHaveBeenCalled();
    });

    it('should update existing preset', async () => {
      const existing = { id: 'uuid', name: 'test', userId: 1, filters: {} };
      savedSearchRepo.findOne.mockResolvedValue(existing as any);
      savedSearchRepo.save.mockImplementation(async (x) => x as any);

      const dto = { name: 'test', filters: { tags: ['tag1'] } };
      const result = await service.savePreset(1, dto);

      expect(result.filters).toEqual({ tags: ['tag1'] });
      expect(savedSearchRepo.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating preset owned by another user', async () => {
      const existing = { id: 'uuid', name: 'test', userId: 2, filters: {} };
      savedSearchRepo.findOne.mockResolvedValue(existing as any);
      const dto = { name: 'test', filters: { tags: ['tag1'] } };
      await expect(service.savePreset(1, dto)).rejects.toThrow(NotFoundException);
      expect(savedSearchRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('recordSearch', () => {
    it('should record a new search entry', async () => {
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      await service.recordSearch(1, { q: 'find me' });

      expect(searchHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'find me',
          filters: {},
        }),
      );
    });

    it('should update usedAt for existing search entry', async () => {
      const existing = { id: 'uuid', query: 'find me', queryHash: '...' };
      searchHistoryRepo.findOne.mockResolvedValue(existing as any);
      searchHistoryRepo.save.mockResolvedValue(existing as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      await service.recordSearch(1, { q: 'find me' });

      expect(searchHistoryRepo.save).toHaveBeenCalledWith(existing);
      expect(searchHistoryRepo.create).not.toHaveBeenCalled();
    });

    it('should prune history if it exceeds 20 entries', async () => {
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(25);
      const oldest = [{ id: 'old1' }, { id: 'old2' }];
      searchHistoryRepo.find.mockResolvedValue(oldest as any);

      await service.recordSearch(1, { q: 'new search' });

      expect(searchHistoryRepo.remove).toHaveBeenCalledWith(oldest);
    });
  });

  describe('deletePreset', () => {
    it('should delete preset for owner', async () => {
      savedSearchRepo.delete.mockResolvedValue({ affected: 1 } as any);
      const res = await service.deletePreset(1, 'id-1');
      expect(savedSearchRepo.delete).toHaveBeenCalledWith({ id: 'id-1', userId: 1 });
      expect(res).toEqual({ affected: 1 });
    });

    it('should throw NotFoundException when deleting a preset owned by another user', async () => {
      savedSearchRepo.delete.mockResolvedValue({ affected: 0 } as any);
      await expect(service.deletePreset(1, 'id-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reads are scoped', () => {
    it('should list presets scoped to user', async () => {
      const items = [{ id: '1', userId: 1, name: 'a' }];
      savedSearchRepo.find.mockResolvedValue(items as any);
      const res = await service.listPresets(1);
      expect(savedSearchRepo.find).toHaveBeenCalledWith({ where: { userId: 1 }, order: { updatedAt: 'DESC' } });
      expect(res).toEqual(items);
    });

    it('should get recent searches scoped to user', async () => {
      const hist = [{ id: 'h1', userId: 1, query: 'x' }];
      searchHistoryRepo.find.mockResolvedValue(hist as any);
      const res = await service.getRecentSearches(1);
      expect(searchHistoryRepo.find).toHaveBeenCalledWith({ where: { userId: 1 }, order: { usedAt: 'DESC' }, take: 20 });
      expect(res).toEqual(hist);
    });
  });

  describe('executeFullTextSearch', () => {
    it('should clamp limit to safe range [1, 100]', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      searchHistoryRepo.manager = mockManager as any;

      // Test with negative limit — should clamp to 1
      await service.executeFullTextSearch(1, { q: 'test', limit: -5 } as any);
      const callArgs1 = mockManager.query.mock.calls[0];
      expect(callArgs1[1]).toContain(1); // last parameter should be clamped limit

      mockManager.query.mockClear();

      // Test with huge limit — should clamp to 100
      await service.executeFullTextSearch(1, { q: 'test', limit: 999 } as any);
      const callArgs2 = mockManager.query.mock.calls[0];
      expect(callArgs2[1]).toContain(100); // last parameter should be clamped limit

      mockManager.query.mockClear();

      // Test with valid limit — should pass through
      await service.executeFullTextSearch(1, { q: 'test', limit: 50 } as any);
      const callArgs3 = mockManager.query.mock.calls[0];
      expect(callArgs3[1]).toContain(50);
    });

    it('should default limit to 40 when not provided', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: 'test' } as any);
      const callArgs = mockManager.query.mock.calls[0];
      expect(callArgs[1]).toContain(40);
    });

    it('should use parameterized query (not string interpolation) for LIMIT', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: 'test', limit: 50 } as any);
      const [query, params] = mockManager.query.mock.calls[0];

      // Verify LIMIT uses a parameterized placeholder ($N), not string interpolation
      expect(query).toMatch(/LIMIT\s+\$\d+/);
      // Verify the limit value is in the parameters array
      expect(params).toContain(50);
    });

    it('should record search history when q is provided', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      searchHistoryRepo.manager = mockManager as any;
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      await service.executeFullTextSearch(1, { q: 'search term', limit: 50 } as any);

      expect(searchHistoryRepo.create).toHaveBeenCalled();
    });

    it('should not record search history when q is empty', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: '', limit: 50 } as any);

      expect(searchHistoryRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ── Issue #1811 — Search query bounds ─────────────────────────────────────

  describe('search query bounds', () => {
    function makeManager() {
      return { query: jest.fn().mockResolvedValue([]) };
    }

    it('empty query returns results without recording history', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: '' } as any);
      await service.executeFullTextSearch(1, { q: '   ' } as any);

      // No history recording for blank queries
      expect(searchHistoryRepo.findOne).not.toHaveBeenCalled();
      // Query should still execute (returns all confessions)
      expect(mockManager.query).toHaveBeenCalledTimes(2);
    });

    it('very long query does not break the query builder', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      const longQuery = 'a'.repeat(5000);
      await service.executeFullTextSearch(1, { q: longQuery } as any);

      const [query, params] = mockManager.query.mock.calls[0];
      // Parameterized — no injection risk regardless of length
      expect(query).toContain('$1');
      expect(params).toContain(longQuery);
    });

    it('special characters in query do not break SQL', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      const maliciousQuery = "'; DROP TABLE confessions; --";
      await service.executeFullTextSearch(1, { q: maliciousQuery } as any);

      const [query, params] = mockManager.query.mock.calls[0];
      // Uses parameterized query — special chars are safe
      expect(query).toContain('$1');
      expect(params).toContain(maliciousQuery);
    });

    it('unicode and emoji queries are handled', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;
      searchHistoryRepo.findOne.mockResolvedValue(null);
      searchHistoryRepo.create.mockImplementation((x) => x as any);
      searchHistoryRepo.save.mockResolvedValue({} as any);
      searchHistoryRepo.count.mockResolvedValue(1);

      await service.executeFullTextSearch(1, { q: '日本語テスト 🎉' } as any);

      expect(mockManager.query).toHaveBeenCalled();
    });

    it('limit=0 clamps to minimum of 1', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: 'test', limit: 0 } as any);
      const params = mockManager.query.mock.calls[0][1];
      expect(params).toContain(1);
    });

    it('negative page-like values are ignored (service uses limit only)', async () => {
      const mockManager = makeManager();
      searchHistoryRepo.manager = mockManager as any;

      await service.executeFullTextSearch(1, { q: 'test', limit: -10 } as any);
      const params = mockManager.query.mock.calls[0][1];
      // Clamped to 1
      expect(params).toContain(1);
    });
  });
});
