import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BookmarkService } from './bookmark.service';
import { Bookmark } from './entities/bookmark.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeConfession = (overrides: Partial<AnonymousConfession> = {}): AnonymousConfession =>
  ({ id: 'conf-uuid-1', message: 'Test', ...overrides }) as AnonymousConfession;

const makeBookmark = (overrides: Partial<Bookmark> = {}): Bookmark =>
  ({
    id: 'bm-uuid-1',
    userId: 42,
    confessionId: 'conf-uuid-1',
    confession: makeConfession(),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as Bookmark;

// ─── Mock repo factory ────────────────────────────────────────────────────────

const repoMock = () => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('BookmarkService', () => {
  let service: BookmarkService;
  let bookmarkRepo: ReturnType<typeof repoMock>;
  let confessionRepo: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarkService,
        { provide: getRepositoryToken(Bookmark), useFactory: repoMock },
        { provide: getRepositoryToken(AnonymousConfession), useFactory: repoMock },
      ],
    }).compile();

    service = module.get(BookmarkService);
    bookmarkRepo = module.get(getRepositoryToken(Bookmark));
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
  });

  afterEach(() => jest.clearAllMocks());

  // ── toggle ──────────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('adds a bookmark when none exists', async () => {
      confessionRepo.findOne.mockResolvedValue(makeConfession());
      bookmarkRepo.findOne.mockResolvedValue(null);
      const bm = makeBookmark();
      bookmarkRepo.create.mockReturnValue(bm);
      bookmarkRepo.save.mockResolvedValue(bm);

      const result = await service.toggle(42, 'conf-uuid-1');

      expect(bookmarkRepo.create).toHaveBeenCalledWith({ userId: 42, confessionId: 'conf-uuid-1' });
      expect(bookmarkRepo.save).toHaveBeenCalledWith(bm);
      expect(result).toEqual({ bookmarked: true, bookmarkId: 'bm-uuid-1' });
    });

    it('removes a bookmark when one exists', async () => {
      confessionRepo.findOne.mockResolvedValue(makeConfession());
      const existing = makeBookmark();
      bookmarkRepo.findOne.mockResolvedValue(existing);
      bookmarkRepo.remove.mockResolvedValue(undefined);

      const result = await service.toggle(42, 'conf-uuid-1');

      expect(bookmarkRepo.remove).toHaveBeenCalledWith(existing);
      expect(result).toEqual({ bookmarked: false, bookmarkId: null });
    });

    it('throws NotFoundException when confession does not exist', async () => {
      confessionRepo.findOne.mockResolvedValue(null);

      await expect(service.toggle(42, 'missing-id')).rejects.toThrow(NotFoundException);
      expect(bookmarkRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated bookmarks for the user', async () => {
      const bm = makeBookmark();
      bookmarkRepo.findAndCount.mockResolvedValue([[bm], 1]);

      const result = await service.list(42, 1, 20);

      expect(bookmarkRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 42 }, take: 20, skip: 0 }),
      );
      expect(result).toEqual({ items: [bm], total: 1, page: 1, limit: 20 });
    });

    it('clamps limit to 100', async () => {
      bookmarkRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(42, 1, 999);

      expect(bookmarkRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      bookmarkRepo.findAndCount.mockResolvedValue([[], 50]);

      await service.list(42, 2, 10);

      expect(bookmarkRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('returns empty list when user has no bookmarks', async () => {
      bookmarkRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.list(99, 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── isBookmarked ─────────────────────────────────────────────────────────────

  describe('isBookmarked', () => {
    it('returns true when bookmark exists', async () => {
      bookmarkRepo.count.mockResolvedValue(1);
      expect(await service.isBookmarked(42, 'conf-uuid-1')).toBe(true);
    });

    it('returns false when bookmark does not exist', async () => {
      bookmarkRepo.count.mockResolvedValue(0);
      expect(await service.isBookmarked(42, 'conf-uuid-1')).toBe(false);
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the bookmark when it exists', async () => {
      const bm = makeBookmark();
      bookmarkRepo.findOne.mockResolvedValue(bm);
      bookmarkRepo.remove.mockResolvedValue(undefined);

      await expect(service.remove(42, 'conf-uuid-1')).resolves.toBeUndefined();
      expect(bookmarkRepo.remove).toHaveBeenCalledWith(bm);
    });

    it('throws NotFoundException when bookmark does not exist', async () => {
      bookmarkRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(42, 'conf-uuid-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── countForUser ─────────────────────────────────────────────────────────────

  describe('countForUser', () => {
    it('returns the total bookmark count for the user', async () => {
      bookmarkRepo.count.mockResolvedValue(7);
      expect(await service.countForUser(42)).toBe(7);
      expect(bookmarkRepo.count).toHaveBeenCalledWith({ where: { userId: 42 } });
    });

    it('returns 0 for a user with no bookmarks', async () => {
      bookmarkRepo.count.mockResolvedValue(0);
      expect(await service.countForUser(99)).toBe(0);
    });
  });
});
