import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { ModerationComment } from './entities/moderation-comment.entity';
import { CommentSortField, GetCommentsQueryDto, SortOrder } from './dto/get-comments-query.dto';
import { encodeCursor } from '../common/pagination';

function makeComment(id: number, createdAt?: Date): Comment {
  return {
    id,
    content: `comment ${id}`,
    createdAt: createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    isDeleted: false,
    replies: [],
  } as unknown as Comment;
}

describe('CommentService — cursor pagination', () => {
  let service: CommentService;
  let qb: any;
  let commentRepo: any;

  const baseQuery: GetCommentsQueryDto = {
    sortField: CommentSortField.CREATED_AT,
    sortOrder: SortOrder.DESC,
    limit: 5,
    page: 1,
    includeOrphanedReplies: false,
  };

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    commentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const moderationRepoMock = { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    const outboxRepoMock = { create: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: getRepositoryToken(AnonymousConfession), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(ModerationComment), useValue: moderationRepoMock },
        { provide: getRepositoryToken(OutboxEvent), useValue: outboxRepoMock },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb: any) =>
              cb({
                getRepository: jest.fn().mockImplementation((entity: any) => {
                  if (entity === Comment) return commentRepo;
                  if (entity === ModerationComment) return moderationRepoMock;
                  return outboxRepoMock;
                }),
              }),
            ),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
            invalidateStatsCache: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(CommentService);
  });

  describe('first page', () => {
    it('returns items up to limit with hasMore=false when fewer items than limit', async () => {
      qb.getMany.mockResolvedValue([makeComment(1), makeComment(2)]);

      const result = await service.findByConfessionId('conf-1', { ...baseQuery, limit: 5 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('returns hasMore=true and nextCursor when limit+1 items fetched', async () => {
      // limit=5 but getMany returns 6 (limit+1)
      qb.getMany.mockResolvedValue(Array.from({ length: 6 }, (_, i) => makeComment(i + 1)));

      const result = await service.findByConfessionId('conf-1', { ...baseQuery, limit: 5 });

      expect(result.data).toHaveLength(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('fetches limit+1 to probe for next page', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findByConfessionId('conf-1', { ...baseQuery, limit: 10 });

      expect(qb.take).toHaveBeenCalledWith(11);
    });

    it('restricts query to top-level comments (no cursor, page=1)', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findByConfessionId('conf-1', { ...baseQuery });

      // top-level filter: andWhere called with parent IS NULL
      expect(qb.andWhere).toHaveBeenCalledWith('comment.parent IS NULL');
    });
  });

  describe('empty page', () => {
    it('returns empty data with hasMore=false and null nextCursor', async () => {
      qb.getMany.mockResolvedValue([]);

      const result = await service.findByConfessionId('conf-1', { ...baseQuery });

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.limit).toBe(5);
    });
  });

  describe('terminal page', () => {
    it('returns hasMore=false when cursor present but fewer items than limit returned', async () => {
      const cursor = encodeCursor({ id: 99, createdAt: new Date().toISOString() });
      qb.getMany.mockResolvedValue([makeComment(100), makeComment(101)]); // only 2, limit=5

      const result = await service.findByConfessionId('conf-1', { ...baseQuery, cursor, limit: 5 });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(2);
    });
  });

  describe('cursor-based middle page', () => {
    it('applies cursor where-condition via andWhere', async () => {
      const cursorDate = '2026-01-01T00:00:00.000Z';
      const cursor = encodeCursor({ id: 10, createdAt: cursorDate });
      qb.getMany.mockResolvedValue([makeComment(11), makeComment(12)]);

      await service.findByConfessionId('conf-1', { ...baseQuery, cursor, limit: 5 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('comment.createdAt'),
        expect.objectContaining({ cursorId: 10, cursorDate }),
      );
    });
  });

  describe('offset-based middle page', () => {
    it('applies skip for page > 1 without cursor', async () => {
      qb.getMany.mockResolvedValue([makeComment(1)]);

      await service.findByConfessionId('conf-1', { ...baseQuery, page: 3, limit: 5 });

      expect(qb.skip).toHaveBeenCalledWith(10); // (3-1) * 5
    });
  });

  describe('ordering determinism', () => {
    it('orders DESC when sortOrder=DESC', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findByConfessionId('conf-1', {
        ...baseQuery,
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
      });

      expect(qb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('comment.createdAt'),
        'DESC',
      );
    });

    it('orders ASC when sortOrder=ASC', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findByConfessionId('conf-1', {
        ...baseQuery,
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.ASC,
      });

      expect(qb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('comment.createdAt'),
        'ASC',
      );
    });

    it('orders by ID field when sortField=ID', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findByConfessionId('conf-1', {
        ...baseQuery,
        sortField: CommentSortField.ID,
        sortOrder: SortOrder.ASC,
      });

      expect(qb.orderBy).toHaveBeenCalledWith('comment.id', 'ASC');
    });

    it('same sort params produce identical result shape on repeated calls', async () => {
      qb.getMany.mockResolvedValue([makeComment(1), makeComment(2)]);

      const r1 = await service.findByConfessionId('conf-1', { ...baseQuery });
      const r2 = await service.findByConfessionId('conf-1', { ...baseQuery });

      expect(r1.limit).toBe(r2.limit);
      expect(r1.hasMore).toBe(r2.hasMore);
      expect(r1.data).toHaveLength(r2.data.length);
    });
  });

  describe('response metadata consistency', () => {
    it('always returns data, hasMore, nextCursor, and limit fields', async () => {
      qb.getMany.mockResolvedValue([makeComment(1)]);

      const result = await service.findByConfessionId('conf-1', { ...baseQuery, limit: 5 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('limit');
      expect(result.limit).toBe(5);
    });
  });
});
