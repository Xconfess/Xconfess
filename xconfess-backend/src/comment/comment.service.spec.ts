import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, UpdateResult } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import {
  ModerationComment,
  ModerationStatus,
} from './entities/moderation-comment.entity';
import {
  CommentSortField,
  GetCommentsQueryDto,
  SortOrder,
} from './dto/get-comments-query.dto';

describe('CommentService (soft‑delete)', () => {
  let service: CommentService;
  let commentRepo: jest.Mocked<Repository<Comment>>;
  let confessionRepo: jest.Mocked<Repository<AnonymousConfession>>;
  let moderationRepo: jest.Mocked<Repository<ModerationComment>>;

  beforeEach(async () => {
    // Pre-create mocks so the DataSource transaction mock can delegate to them.
    const commentRepoMock = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const moderationRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    const outboxRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getRepositoryToken(Comment),
          useValue: commentRepoMock,
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ModerationComment),
          useValue: moderationRepoMock,
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: outboxRepoMock,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb: any) =>
              cb({
                getRepository: jest.fn().mockImplementation((entity: any) => {
                  if (entity === Comment) return commentRepoMock;
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
    commentRepo = module.get(getRepositoryToken(Comment));
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
    moderationRepo = module.get(getRepositoryToken(ModerationComment));
  });

  describe(`findByConfessionId()`, () => {
    it(`returns an empty list when no comments`, async () => {
      // Mock a chained query builder
      const fakeQB: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (commentRepo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(fakeQB);
      const queryDto: GetCommentsQueryDto = {
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        limit: 20,
      };
      const res = await service.findByConfessionId('conf1', queryDto);
      expect(res.comments).toEqual([]);
      expect((commentRepo as any).createQueryBuilder).toHaveBeenCalledWith(
        'comment',
      );
    });
  });

  describe(`delete()`, () => {
    const fakeUser = { id: 'anon1' } as any;
    const goodComment = {
      id: 42,
      anonymousUser: { id: 'anon1' },
      isDeleted: false,
    } as any;

    it(`sets isDeleted to true when user owns it`, async () => {
      commentRepo.findOne.mockResolvedValue(goodComment);
      (commentRepo.update as jest.Mock).mockResolvedValue({
        affected: 1,
      } as UpdateResult);

      await expect(service.delete(42, fakeUser)).resolves.toBeUndefined();
      expect(commentRepo.update).toHaveBeenCalledWith(42, { isDeleted: true });
    });

    it(`throws NotFoundException if comment not found`, async () => {
      commentRepo.findOne.mockResolvedValue(null);
      await expect(service.delete(99, fakeUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it(`throws BadRequestException if user doesn’t own comment`, async () => {
      commentRepo.findOne.mockResolvedValue({
        id: 42,
        anonymousUser: { id: 77 },
        isDeleted: false,
      } as any);
      await expect(service.delete(42, fakeUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe(`create()`, () => {
    const fakeUser = { id: 5 } as any;
    const fakeAnonUser = { id: 'anon1' } as any;
    const fakeConf = {
      id: 'c1',
      anonymousUser: { email: 'a@b.com' },
      isDeleted: false,
    } as any;
    const fakeComment = {
      id: 101,
      content: 'hey',
      anonymousUser: fakeUser,
      confession: fakeConf,
    } as any;

    it(`throws if confession not found or deleted`, async () => {
      confessionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create('hey', fakeAnonUser, 'c1', 'anonCtx'),
      ).rejects.toThrow(NotFoundException);

      // When the DB filters out deleted confessions (isDeleted: false in WHERE),
      // it returns null — simulate the same by returning null here.
      confessionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create('hey', fakeAnonUser, 'c1', 'anonCtx'),
      ).rejects.toThrow(NotFoundException);
    });

    it(`creates comment and moderation entry`, async () => {
      const savedComment = {
        id: 101,
        content: 'hey',
        anonymousUser: fakeAnonUser,
        confession: fakeConf,
      } as any;
      confessionRepo.findOne.mockResolvedValue(fakeConf);
      commentRepo.create.mockReturnValue(savedComment);
      commentRepo.save.mockResolvedValue(savedComment);
      moderationRepo.create.mockReturnValue({
        commentId: 101,
        status: ModerationStatus.PENDING,
      } as any);
      moderationRepo.save.mockResolvedValue({} as any);

      const result = await service.create('hey', fakeAnonUser, 'c1', 'anonCtx');
      expect(commentRepo.create).toHaveBeenCalledWith({
        content: 'hey',
        anonymousUser: fakeAnonUser,
        confession: fakeConf,
        anonymousContextId: 'anonCtx',
      });
      expect(moderationRepo.save).toHaveBeenCalled();
      expect(result).toBe(savedComment);
    });
  });
});

describe('CommentService (moderation)', () => {
  let service: CommentService;
  let moderationRepo: jest.Mocked<Repository<ModerationComment>>;
  let commentRepo: jest.Mocked<Repository<Comment>>;
  let confessionRepo: jest.Mocked<Repository<AnonymousConfession>>;

  beforeEach(async () => {
    const commentRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const moderationRepoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const outboxRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getRepositoryToken(Comment),
          useValue: commentRepoMock,
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(ModerationComment),
          useValue: moderationRepoMock,
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: outboxRepoMock,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb: any) =>
              cb({
                getRepository: jest.fn().mockImplementation((entity: any) => {
                  if (entity === Comment) return commentRepoMock;
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
    moderationRepo = module.get(getRepositoryToken(ModerationComment));
    commentRepo = module.get(getRepositoryToken(Comment));
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
  });

  describe('moderateComment()', () => {
    const moderator = { id: 1 } as any;
    const comment = { id: 10 } as any;
    it('approves a pending comment', async () => {
      const moderation = {
        comment,
        status: ModerationStatus.PENDING,
        save: jest.fn(),
      } as any;
      moderationRepo.findOne.mockResolvedValue(moderation);
      moderationRepo.save.mockResolvedValue({
        ...moderation,
        status: ModerationStatus.APPROVED,
      });
      const result = await service.moderateComment(
        10,
        ModerationStatus.APPROVED,
        moderator,
      );
      expect(result.success).toBe(true);
      expect(moderationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ModerationStatus.APPROVED,
          moderatedBy: moderator,
        }),
      );
    });
    it('rejects a pending comment', async () => {
      const moderation = {
        comment,
        status: ModerationStatus.PENDING,
        save: jest.fn(),
      } as any;
      moderationRepo.findOne.mockResolvedValue(moderation);
      moderationRepo.save.mockResolvedValue({
        ...moderation,
        status: ModerationStatus.REJECTED,
      });
      const result = await service.moderateComment(
        10,
        ModerationStatus.REJECTED,
        moderator,
      );
      expect(result.success).toBe(true);
      expect(moderationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ModerationStatus.REJECTED,
          moderatedBy: moderator,
        }),
      );
    });
    it('throws if moderation entry not found', async () => {
      moderationRepo.findOne.mockResolvedValue(null);
      await expect(
        service.moderateComment(99, ModerationStatus.APPROVED, moderator),
      ).rejects.toThrow();
    });
    it('throws if already moderated', async () => {
      const moderation = { comment, status: ModerationStatus.APPROVED } as any;
      moderationRepo.findOne.mockResolvedValue(moderation);
      await expect(
        service.moderateComment(10, ModerationStatus.REJECTED, moderator),
      ).rejects.toThrow();
    });
  });

  describe('create() moderation entry', () => {
    it('creates a moderation entry when a comment is created', async () => {
      const confession = { id: 'c1', anonymousUser: { id: 'anon1' } } as any;
      const comment = {
        id: 101,
        content: 'hey',
        anonymousUser: { id: 'anon1' },
        confession,
      } as any;
      confessionRepo.findOne.mockResolvedValue(confession);
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      const moderationObj = {
        id: 1,
        comment,
        commentId: comment.id,
        status: ModerationStatus.PENDING,
        createdAt: new Date(),
      } as ModerationComment;
      moderationRepo.create.mockReturnValue(moderationObj);
      moderationRepo.save.mockResolvedValue(moderationObj);
      await service.create('hey', { id: 'anon1' } as any, 'c1', 'anonCtx');
      expect(moderationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          comment,
          status: ModerationStatus.PENDING,
          commentId: comment.id,
        }),
      );
      expect(moderationRepo.save).toHaveBeenCalled();
    });
  });
});

// ─── Analytics cache invalidation ────────────────────────────────────────────

describe('CommentService – analytics cache invalidation', () => {
  let service: CommentService;
  let analyticsService: jest.Mocked<
    Pick<AnalyticsService, 'invalidateTrendingCache' | 'invalidateStatsCache'>
  >;
  let moderationRepo: jest.Mocked<Repository<ModerationComment>>;
  let commentRepo: jest.Mocked<Repository<Comment>>;

  const makeProviders = (analyticsValue: any, dataSourceValue?: any) => [
    CommentService,
    {
      provide: getRepositoryToken(Comment),
      useValue: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      },
    },
    {
      provide: getRepositoryToken(AnonymousConfession),
      useValue: {
        findOne: jest.fn().mockResolvedValue({
          id: 'c1',
          anonymousUser: null,
          isDeleted: false,
        }),
      },
    },
    {
      provide: getRepositoryToken(ModerationComment),
      useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    },
    {
      provide: getRepositoryToken(OutboxEvent),
      useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn() },
    },
    {
      provide: DataSource,
      useValue: dataSourceValue ?? {
        transaction: jest.fn().mockImplementation((cb: any) =>
          cb({
            getRepository: jest.fn().mockReturnValue({
              create: jest.fn().mockReturnValue({ id: 101, content: 'hey' }),
              save: jest.fn().mockResolvedValue({ id: 101, content: 'hey' }),
              findOne: jest.fn().mockResolvedValue(null),
            }),
          }),
        ),
      },
    },
    { provide: AnalyticsService, useValue: analyticsValue },
  ];

  beforeEach(() => {
    analyticsService = {
      invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
      invalidateStatsCache: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('invalidates trending cache after a comment is saved', async () => {
      const module = await Test.createTestingModule({
        providers: makeProviders(analyticsService),
      }).compile();

      service = module.get(CommentService);

      await service.create('hello', { id: 'anon1' } as any, 'c1', 'ctx1');
      await Promise.resolve(); // settle fire-and-forget
      expect(analyticsService.invalidateTrendingCache).toHaveBeenCalledWith(
        'comment-created',
      );
    });
  });

  describe('delete()', () => {
    it('invalidates trending cache after a soft-delete', async () => {
      const commentRepoValue = {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          anonymousUser: { id: 'anon1' },
          isDeleted: false,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      const module = await Test.createTestingModule({
        providers: [
          CommentService,
          { provide: getRepositoryToken(Comment), useValue: commentRepoValue },
          {
            provide: getRepositoryToken(AnonymousConfession),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(ModerationComment),
            useValue: {
              findOne: jest.fn(),
              create: jest.fn(),
              save: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(OutboxEvent),
            useValue: { create: jest.fn(), save: jest.fn() },
          },
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          { provide: AnalyticsService, useValue: analyticsService },
        ],
      }).compile();

      service = module.get(CommentService);
      await service.delete(1, { id: 'anon1' } as any);
      await Promise.resolve();
      expect(analyticsService.invalidateTrendingCache).toHaveBeenCalledWith(
        'comment-deleted',
      );
    });
  });

  describe('moderateComment()', () => {
    const moderator = { id: 99 } as any;

    it('invalidates trending cache after approval', async () => {
      const modEntry = {
        comment: { id: 10 },
        status: ModerationStatus.PENDING,
      } as any;
      const modRepoValue = {
        findOne: jest.fn().mockResolvedValue(modEntry),
        save: jest.fn().mockResolvedValue({
          ...modEntry,
          status: ModerationStatus.APPROVED,
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          CommentService,
          {
            provide: getRepositoryToken(Comment),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(AnonymousConfession),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(ModerationComment),
            useValue: modRepoValue,
          },
          {
            provide: getRepositoryToken(OutboxEvent),
            useValue: { create: jest.fn(), save: jest.fn() },
          },
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          { provide: AnalyticsService, useValue: analyticsService },
        ],
      }).compile();

      service = module.get(CommentService);
      await service.moderateComment(10, ModerationStatus.APPROVED, moderator);
      await Promise.resolve();
      expect(analyticsService.invalidateTrendingCache).toHaveBeenCalledWith(
        `comment-moderated:${ModerationStatus.APPROVED}`,
      );
      expect(analyticsService.invalidateStatsCache).toHaveBeenCalledWith(
        `comment-moderated:${ModerationStatus.APPROVED}`,
      );
    });

    it('invalidates caches after rejection', async () => {
      const modEntry = {
        comment: { id: 11 },
        status: ModerationStatus.PENDING,
      } as any;
      const modRepoValue = {
        findOne: jest.fn().mockResolvedValue(modEntry),
        save: jest.fn().mockResolvedValue({
          ...modEntry,
          status: ModerationStatus.REJECTED,
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          CommentService,
          {
            provide: getRepositoryToken(Comment),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(AnonymousConfession),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(ModerationComment),
            useValue: modRepoValue,
          },
          {
            provide: getRepositoryToken(OutboxEvent),
            useValue: { create: jest.fn(), save: jest.fn() },
          },
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          { provide: AnalyticsService, useValue: analyticsService },
        ],
      }).compile();

      service = module.get(CommentService);
      await service.moderateComment(11, ModerationStatus.REJECTED, moderator);
      await Promise.resolve();
      expect(analyticsService.invalidateTrendingCache).toHaveBeenCalledWith(
        `comment-moderated:${ModerationStatus.REJECTED}`,
      );
    });

    it('does NOT call analytics invalidation when moderation entry is not found', async () => {
      const modRepoValue = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };

      const module = await Test.createTestingModule({
        providers: [
          CommentService,
          {
            provide: getRepositoryToken(Comment),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(AnonymousConfession),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(ModerationComment),
            useValue: modRepoValue,
          },
          {
            provide: getRepositoryToken(OutboxEvent),
            useValue: { create: jest.fn(), save: jest.fn() },
          },
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          { provide: AnalyticsService, useValue: analyticsService },
        ],
      }).compile();

      service = module.get(CommentService);
      await expect(
        service.moderateComment(99, ModerationStatus.APPROVED, moderator),
      ).rejects.toThrow(NotFoundException);
      expect(analyticsService.invalidateTrendingCache).not.toHaveBeenCalled();
      expect(analyticsService.invalidateStatsCache).not.toHaveBeenCalled();
    });
  });
});

// ─── Cursor Pagination Tests ─────────────────────────────────────────────────────

describe('CommentService (cursor pagination)', () => {
  let service: CommentService;
  let commentRepo: jest.Mocked<Repository<Comment>>;
  let confessionRepo: jest.Mocked<Repository<AnonymousConfession>>;
  let moderationRepo: jest.Mocked<Repository<ModerationComment>>;

  beforeEach(async () => {
    const commentRepoMock = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const moderationRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    const outboxRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getRepositoryToken(Comment),
          useValue: commentRepoMock,
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(ModerationComment),
          useValue: moderationRepoMock,
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: outboxRepoMock,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb: any) =>
              cb({
                getRepository: jest.fn().mockImplementation((entity: any) => {
                  if (entity === Comment) return commentRepoMock;
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
    commentRepo = module.get(getRepositoryToken(Comment));
    moderationRepo = module.get(getRepositoryToken(ModerationComment));
  });

  describe('findByConfessionId with cursor pagination', () => {
    const mockComments = [
      {
        id: 1,
        content: 'First comment',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        isDeleted: false,
      },
      {
        id: 2,
        content: 'Second comment',
        createdAt: new Date('2024-01-01T11:00:00Z'),
        isDeleted: false,
      },
      {
        id: 3,
        content: 'Third comment',
        createdAt: new Date('2024-01-01T12:00:00Z'),
        isDeleted: false,
      },
    ] as Comment[];

    it('returns paginated results without cursor', async () => {
      const fakeQB: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockComments.slice(0, 2)),
      };
      (commentRepo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(fakeQB);

      const queryDto: GetCommentsQueryDto = {
        limit: 2,
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        includeOrphanedReplies: false,
      };

      const result = await service.findByConfessionId('conf1', queryDto);

      expect(result.comments).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('includes orphaned replies when requested', async () => {
      const fakeQB: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockComments),
      };
      (commentRepo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(fakeQB);

      const queryDto: GetCommentsQueryDto = {
        limit: 10,
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        includeOrphanedReplies: true,
      };

      await service.findByConfessionId('conf1', queryDto);

      // Should not filter out orphaned replies
      expect(fakeQB.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'comment.parent IS NULL OR comment.parent.isDeleted = false',
        ),
        expect.anything(),
      );
    });

    it('filters orphaned replies by default', async () => {
      const fakeQB: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockComments),
      };
      (commentRepo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(fakeQB);

      const queryDto: GetCommentsQueryDto = {
        limit: 10,
        sortField: CommentSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        includeOrphanedReplies: false,
      };

      await service.findByConfessionId('conf1', queryDto);

      // Should filter out orphaned replies (third andWhere after base filters)
      expect(fakeQB.andWhere).toHaveBeenNthCalledWith(
        3,
        '(comment.parent IS NULL OR comment.parent.isDeleted = false)',
      );
    });
  });
});
