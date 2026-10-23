import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message } from './entities/message.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { MessageRepository } from './repository/message.repository';
import { User } from '../user/entities/user.entity';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { decodeCursor } from '../common/pagination';
import { PAGINATION } from '../common/pagination';

const CONFESSION_ID = '11111111-1111-4111-8111-111111111111';
const SENDER_ID = '22222222-2222-4222-8222-222222222222';
const AUTHOR_ANON_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ANON_ID = '44444444-4444-4444-8444-444444444444';
const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);

interface Row {
  id: number;
  confessionId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  [key: string]: unknown;
}

/**
 * Stateful fake for the TypeORM query builder used by
 * `MessagesService.findForConfessionThread`. It honours the exact
 * `confessionId`/`senderId` predicates plus the `(createdAt, id)` keyset cursor
 * the service builds, so the tests exercise real page traversal rather than
 * asserting on raw SQL strings.
 */
function createStatefulQueryBuilder(dataset: Row[]) {
  const params: Record<string, unknown> = {};
  let take: number | undefined;

  const builder: any = {
    where: jest.fn((_sql: string, values: Record<string, unknown>) => {
      Object.assign(params, values);
      return builder;
    }),
    andWhere: jest.fn((_sql: string, values: Record<string, unknown>) => {
      Object.assign(params, values);
      return builder;
    }),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    take: jest.fn((n: number) => {
      take = n;
      return builder;
    }),
    skip: jest.fn(() => builder),
    leftJoinAndSelect: jest.fn(() => builder),
    getMany: jest.fn(async () => {
      const { confessionId, senderId, cursorDate, cursorId } = params as {
        confessionId: string;
        senderId: string;
        cursorDate?: string;
        cursorId?: number;
      };

      let rows = dataset
        .filter(
          (m) => m.confessionId === confessionId && m.senderId === senderId,
        )
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
        );

      if (cursorDate !== undefined) {
        const cursorTime = new Date(cursorDate).getTime();
        rows = rows.filter(
          (m) =>
            m.createdAt.getTime() > cursorTime ||
            (m.createdAt.getTime() === cursorTime &&
              m.id > (cursorId as number)),
        );
      }

      return rows.slice(0, take ?? rows.length);
    }),
  };

  return builder;
}

function buildDataset(): Row[] {
  const rows: Row[] = [];
  for (let id = 1; id <= 25; id += 1) {
    // ids 10 and 11 intentionally share a timestamp to prove the cursor's
    // (createdAt, id) tie-breaker keeps ordering deterministic across pages.
    const offset = id === 11 ? 10 : id;
    rows.push({
      id,
      confessionId: CONFESSION_ID,
      senderId: SENDER_ID,
      content: `message-${id}`,
      createdAt: new Date(BASE_TIME + offset * 1000),
    });
  }
  return rows;
}

describe('MessagesService — bounded history pagination (#1988) & anonymous conversation authorization (#1987)', () => {
  let service: MessagesService;
  let queryBuilder: any;
  let confessionRepo: Repository<AnonymousConfession>;
  let userAnonRepo: Repository<UserAnonymousUser>;
  let customMessageRepository: MessageRepository;

  const dataset = buildDataset();
  const user = { id: 1 } as User;

  beforeEach(async () => {
    queryBuilder = createStatefulQueryBuilder(dataset);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: getRepositoryToken(Message),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilder),
            manager: { transaction: jest.fn() },
          },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserAnonymousUser),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: { create: jest.fn(), save: jest.fn() },
        },
        {
          provide: AnonymousUserService,
          useValue: { getOrCreateForUserSession: jest.fn() },
        },
        {
          provide: MessageRepository,
          useValue: {
            markThreadRead: jest.fn(),
            markMessagesDelivered: jest.fn(),
            markMessagesRead: jest.fn(),
          },
        },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    confessionRepo = module.get(getRepositoryToken(AnonymousConfession));
    userAnonRepo = module.get(getRepositoryToken(UserAnonymousUser));
    customMessageRepository = module.get(MessageRepository);

    jest.spyOn(confessionRepo, 'findOne').mockResolvedValue({
      id: CONFESSION_ID,
      anonymousUser: { id: AUTHOR_ANON_ID },
    } as any);
    jest
      .spyOn(userAnonRepo, 'find')
      .mockResolvedValue([{ anonymousUserId: AUTHOR_ANON_ID }] as any);
  });

  afterEach(() => jest.restoreAllMocks());

  async function fetchPage(
    query: GetMessagesQueryDto,
    senderId: string = SENDER_ID,
  ) {
    return service.findForConfessionThread(
      CONFESSION_ID,
      senderId,
      user,
      query,
    );
  }

  describe('first, middle, and final pages', () => {
    it('walks a 25-message conversation across pages without gaps or duplicates', async () => {
      const first = await fetchPage({ limit: 10 });
      expect(first.data.map((m) => m.id)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).not.toBeNull();
      expect(first.limit).toBe(10);

      const middle = await fetchPage({ limit: 10, cursor: first.nextCursor! });
      expect(middle.data.map((m) => m.id)).toEqual([
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      ]);
      expect(middle.hasMore).toBe(true);

      const final = await fetchPage({ limit: 10, cursor: middle.nextCursor! });
      expect(final.data.map((m) => m.id)).toEqual([21, 22, 23, 24, 25]);
      expect(final.hasMore).toBe(false);
      expect(final.nextCursor).toBeNull();

      const allIds = [...first.data, ...middle.data, ...final.data].map(
        (m) => m.id,
      );
      expect(allIds).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
      expect(new Set(allIds).size).toBe(25);
    });

    it('preserves ascending message ordering within and across pages', async () => {
      const first = await fetchPage({ limit: 10 });
      const middle = await fetchPage({ limit: 10, cursor: first.nextCursor! });
      const combined = [...first.data, ...middle.data];

      for (let i = 1; i < combined.length; i += 1) {
        const prev = combined[i - 1];
        const next = combined[i];
        expect(
          prev.createdAt.getTime() < next.createdAt.getTime() ||
            (prev.createdAt.getTime() === next.createdAt.getTime() &&
              prev.id < next.id),
        ).toBe(true);
      }
    });

    it('returns a deterministic cursor for the same page', async () => {
      const a = await fetchPage({ limit: 10 });
      const b = await fetchPage({ limit: 10 });

      expect(a.nextCursor).toBe(b.nextCursor);
      expect(decodeCursor(a.nextCursor!)).toEqual({
        id: 10,
        createdAt: new Date(BASE_TIME + 10000).toISOString(),
      });
    });

    it('resumes after a duplicate-timestamp boundary using the id tie-breaker', async () => {
      const first = await fetchPage({ limit: 10 });
      const middle = await fetchPage({ limit: 10, cursor: first.nextCursor! });

      expect(first.data[9].id).toBe(10);
      expect(middle.data[0].id).toBe(11);
      expect(middle.data[0].createdAt.getTime()).toBe(
        first.data[9].createdAt.getTime(),
      );
    });

    it('applies the default bounded page size when limit is omitted', async () => {
      const page = await fetchPage({});
      expect(page.limit).toBe(PAGINATION.DEFAULT_LIMIT);
      expect(page.data).toHaveLength(PAGINATION.DEFAULT_LIMIT);
    });
  });

  describe('server-side maximum page size', () => {
    it('accepts the maximum limit', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: PAGINATION.MAX_LIMIT,
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a limit above the maximum', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: PAGINATION.MAX_LIMIT + 1,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('rejects a non-positive limit', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });

  describe('anonymous conversation authorization & history retrieval (#1987)', () => {
    it('allows the confession author to retrieve ordered history', async () => {
      const page = await fetchPage({ limit: 5 });

      expect(page.data.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
      expect(customMessageRepository.markThreadRead).toHaveBeenCalledWith(
        CONFESSION_ID,
        SENDER_ID,
        'AUTHOR',
      );
    });

    it('allows the sender to retrieve their own ordered history', async () => {
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: SENDER_ID }] as any);

      const page = await fetchPage({ limit: 5 });

      expect(page.data.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
      expect(customMessageRepository.markThreadRead).toHaveBeenCalledWith(
        CONFESSION_ID,
        SENDER_ID,
        'SENDER',
      );
      expect(
        customMessageRepository.markMessagesDelivered,
      ).toHaveBeenCalledWith(CONFESSION_ID, SENDER_ID);
    });

    it('hides the thread from a non-participant (non-disclosing 404)', async () => {
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: OUTSIDER_ANON_ID }] as any);

      await expect(fetchPage({ limit: 5 })).rejects.toThrow(NotFoundException);
    });

    it('hides the thread for a forged sender id with no history', async () => {
      await expect(
        fetchPage({ limit: 5 }, 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty confession id', async () => {
      await expect(
        service.findForConfessionThread('', SENDER_ID, user, { limit: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
