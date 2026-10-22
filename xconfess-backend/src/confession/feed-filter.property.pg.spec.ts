import * as fc from 'fast-check';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfessionService } from './confession.service';
import { AnonymousConfession } from './entities/confession.entity';
import {
  GetConfessionsDto,
  Gender,
  SortOrder,
} from './dto/get-confessions.dto';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { Reaction } from '../reaction/entities/reaction.entity';
import { Comment } from '../comment/entities/comment.entity';
import { CacheService } from '../cache/cache.service';
import { encryptConfession } from '../utils/confession-encryption';
import { PAGINATION } from '../common/pagination';
import {
  describePostgres,
  createReliabilityDatabase,
  destroyReliabilityDatabase,
  createTestUser,
} from '../../test/utils/reliability-postgres';

const seed = Number(process.env.FC_SEED ?? 2351);
const replay = process.env.FC_PATH ? { path: process.env.FC_PATH } : {};
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const transform = (value: unknown) =>
  pipe.transform(value, { type: 'query', metatype: GetConfessionsDto });

describe('generated invalid feed filters (#2351)', () => {
  it('rejects invalid enums, pagination and cursor combinations reproducibly', async () => {
    const invalid = fc.oneof(
      fc
        .string()
        .filter((s) => !Object.values(SortOrder).includes(s as SortOrder))
        .map((sort) => ({ sort })),
      fc
        .string()
        .filter((s) => !Object.values(Gender).includes(s as Gender))
        .map((gender) => ({ gender })),
      fc
        .constantFrom(0, -1, 1.5, PAGINATION.MAX_LIMIT + 1, 'NaN')
        .map((limit) => ({ limit })),
      fc
        .constantFrom(0, -1, 1.5, PAGINATION.MAX_PAGE + 1, 'NaN')
        .map((page) => ({ page })),
      fc
        .string({ minLength: 1 })
        .filter((s) => !s.trim().startsWith('ey'))
        .map((s) => ({ cursor: `invalid:${s}` })),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.values(SortOrder)),
        invalid,
        async (sort, bad) => {
          await expect(
            transform({
              sort,
              gender: Gender.OTHER,
              page: '1',
              limit: '5',
              ...bad,
            }),
          ).rejects.toBeInstanceOf(BadRequestException);
        },
      ),
      { seed, numRuns: 100, ...replay },
    );
  });
});

describePostgres('generated feed filters on PostgreSQL (#2351)', () => {
  let ds: DataSource;
  let service: ConfessionService;
  const authors: AnonymousUser[] = [];
  const reactionAuthors: AnonymousUser[] = [];

  beforeAll(async () => {
    ds = await createReliabilityDatabase();
    // Unlinked anonymous author, discoverable user, and private user.
    for (const discoverable of [undefined, true, false]) {
      const anon = await ds.getRepository(AnonymousUser).save({});
      authors.push(anon);
      if (discoverable !== undefined) {
        const user = await createTestUser(ds);
        user.privacySettings.isDiscoverable = discoverable;
        await ds.getRepository('User').save(user);
        await ds
          .getRepository(UserAnonymousUser)
          .save({ userId: user.id, anonymousUserId: anon.id });
      }
    }
    for (let i = 0; i < 3; i++)
      reactionAuthors.push(await ds.getRepository(AnonymousUser).save({}));
    const cache = new CacheService({
      get: async () => undefined,
      set: async () => undefined,
    } as any);
    service = new ConfessionService(
      ds.getRepository(AnonymousConfession) as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      cache,
      null as any,
      { get: () => process.env.CONFESSION_ENCRYPTION_KEY } as any,
      null as any,
      null as any,
      ds,
    );
  }, 30000);
  afterAll(() => destroyReliabilityDatabase(ds));

  it('matches an independent visibility/filter model and traverses each ordering without gaps', async () => {
    const row = fc.record({
      id: fc.uuid(),
      gender: fc.constantFrom(...Object.values(Gender)),
      author: fc.integer({ min: 0, max: 2 }),
      deleted: fc.boolean(),
      hidden: fc.boolean(),
      moderation: fc.constantFrom('approved', 'pending', 'rejected', 'flagged'),
      publication: fc.constantFrom('published', 'draft', 'past', 'future'),
      age: fc.integer({ min: 0, max: 3 }),
      reactions: fc.integer({ min: 0, max: 3 }),
      comments: fc.integer({ min: 0, max: 3 }),
    });
    await fc.assert(
      fc.asyncProperty(
        fc
          .uniqueArray(row, {
            selector: (item) => item.id,
            minLength: 12,
            maxLength: 24,
          })
          .map((rows) =>
            rows.map((item, index) =>
              index < 9
                ? {
                    ...item,
                    deleted: false,
                    hidden: false,
                    moderation: index % 2 ? 'approved' : 'pending',
                    publication: index % 2 ? 'published' : 'past',
                    author: index % 2,
                    gender: Object.values(Gender)[index % 3],
                  }
                : item,
            ),
          ),
        fc.constantFrom(...Object.values(SortOrder)),
        fc.option(fc.constantFrom(...Object.values(Gender)), {
          nil: undefined,
        }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        async (rows, sort, gender, limit, page) => {
          await ds
            .getRepository(Comment)
            .createQueryBuilder()
            .delete()
            .execute();
          await ds
            .getRepository(AnonymousConfession)
            .createQueryBuilder()
            .delete()
            .execute();
          for (const item of rows) {
            const confession = await ds
              .getRepository(AnonymousConfession)
              .save({
                id: item.id,
                gender: item.gender,
                anonymousUser: authors[item.author],
                message: encryptConfession(
                  'synthetic feed fixture',
                  process.env.CONFESSION_ENCRYPTION_KEY!,
                ),
                isDeleted: item.deleted,
                isHidden: item.hidden,
                moderationStatus: item.moderation,
                status: ['past', 'future'].includes(item.publication)
                  ? 'scheduled'
                  : item.publication,
                publishAt:
                  item.publication === 'future'
                    ? new Date('2099-01-01')
                    : new Date('2020-01-01'),
                created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, item.age)),
              });
            for (let i = 0; i < item.reactions; i++)
              await ds
                .getRepository(Reaction)
                .save({
                  confession,
                  anonymousUser: reactionAuthors[i],
                  emoji: '❤️',
                });
            for (let i = 0; i < item.comments + 1; i++)
              await ds
                .getRepository(Comment)
                .save({
                  confession,
                  anonymousUser: authors[0],
                  content: 'synthetic comment',
                  isDeleted: i === item.comments,
                });
          }
          const expected = rows
            .filter(
              (item) =>
                !item.deleted &&
                !item.hidden &&
                ['approved', 'pending'].includes(item.moderation) &&
                ['published', 'past'].includes(item.publication) &&
                item.author !== 2 &&
                (!gender || item.gender === gender),
            )
            .sort(
              (a, b) =>
                (sort === SortOrder.TRENDING
                  ? b.reactions - a.reactions
                  : sort === SortOrder.MOST_DISCUSSED
                    ? b.comments - a.comments
                    : 0) ||
                b.age - a.age ||
                b.id.localeCompare(a.id),
            )
            .slice((page - 1) * limit)
            .map((item) => item.id);
          const query = await transform({
            sort,
            gender,
            limit: String(limit),
            page: String(page),
          });
          const first = await service.getConfessions(query);
          expect((await service.getConfessions(query)).data).toEqual(
            first.data,
          );
          const actual = first.data.map((item) => item.id);
          let cursor = first.nextCursor;
          for (let pages = 0; cursor && pages <= rows.length; pages++) {
            const result = await service.getConfessions({ ...query, cursor });
            actual.push(...result.data.map((item) => item.id));
            cursor = result.nextCursor;
          }
          expect(cursor).toBeNull();
          expect(actual).toEqual(expected);
          expect(new Set(actual).size).toBe(actual.length);
        },
      ),
      { seed, numRuns: 60, ...replay },
    );
  }, 120000);
});
