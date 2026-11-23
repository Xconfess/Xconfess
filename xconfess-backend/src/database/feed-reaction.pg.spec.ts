/**
 * Real-Postgres regression checks for the feed keyset index (#1933) and
 * concurrent reaction writes (#1927). Mocks cannot reproduce Postgres
 * aborting a transaction after a unique violation, so these need a live DB.
 *
 * Opt-in (drops and re-syncs the target schema — use a throwaway database):
 *   PG_INTEGRATION=true DB_HOST=... DB_PORT=... DB_USERNAME=... \
 *   DB_PASSWORD=... DB_NAME=... npx jest src/database/feed-reaction.pg.spec.ts
 */
import { DataSource } from 'typeorm';
import { ReactionService } from '../reaction/reaction.service';
import { Reaction } from '../reaction/entities/reaction.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import {
  AddFeedKeysetIndexes20260923000001,
  FEED_KEYSET_INDEXES,
} from '../migrations/20260923000001-add-feed-keyset-indexes';

jest.setTimeout(120000);

const describePg =
  process.env.PG_INTEGRATION === 'true' ? describe : describe.skip;

describePg('feed + reaction behaviour on real Postgres', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [__dirname + '/../**/*.entity.ts'],
      synchronize: true,
      dropSchema: true,
      extra: { max: 30 },
    });
    await ds.initialize();
  });
  afterAll(() => ds?.destroy());

  const indexNames = async () =>
    (
      await ds.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`,
        [FEED_KEYSET_INDEXES.map((i) => i.name)],
      )
    ).map((r: any) => r.indexname).sort();

  it('feed index migration: up, idempotent re-up, down', async () => {
    const m = new AddFeedKeysetIndexes20260923000001();
    const qr = ds.createQueryRunner();
    await m.up(qr);
    await m.up(qr);
    expect(await indexNames()).toEqual(
      FEED_KEYSET_INDEXES.map((i) => i.name).sort(),
    );

    // planner uses the keyset index for the NEWEST cursor query
    await ds.query(`SET enable_seqscan = off`);
    const plan = (
      await ds.query(`EXPLAIN SELECT id FROM anonymous_confessions
        WHERE "isDeleted" = false AND is_hidden = false
          AND (created_at, id) < (now(), '00000000-0000-0000-0000-000000000000')
        ORDER BY created_at DESC, id DESC LIMIT 11`)
    ).map((r: any) => r['QUERY PLAN']).join('\n');
    await ds.query(`SET enable_seqscan = on`);
    expect(plan).toContain('idx_confessions_feed_keyset');

    await m.down(qr);
    expect(await indexNames()).toEqual([]);
    await m.up(qr);
    await qr.release();
  });

  const makeService = () =>
    new ReactionService(
      ds.getRepository(Reaction),
      ds.getRepository(AnonymousConfession),
      ds.getRepository(AnonymousUser),
      ds.getRepository(OutboxEvent),
      ds,
      {
        invalidateTrendingCache: async () => undefined,
        invalidateReactionDistributionCache: async () => undefined,
      } as any,
      { broadcastReactionAdded: jest.fn() } as any,
    );

  const seed = async () => {
    const author = await ds.getRepository(AnonymousUser).save({});
    const reactor = await ds.getRepository(AnonymousUser).save({});
    const confession = await ds.getRepository(AnonymousConfession).save({
      message: 'hello',
      anonymousUser: author,
    } as any);
    return { confession, reactor };
  };

  it('parallel identical reactions settle on one row', async () => {
    const { confession, reactor } = await seed();
    const service = makeService();
    const dto = {
      confessionId: confession.id,
      anonymousUserId: reactor.id,
      emoji: '❤️',
    };

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.createReaction(dto as any)),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r: any) => r.reason?.message)).toEqual([]);

    const rows = await ds.getRepository(Reaction).find({
      where: { confession: { id: confession.id } },
    });
    expect(rows).toHaveLength(1);
  });

  it('parallel different-emoji reactions settle on one row', async () => {
    const { confession, reactor } = await seed();
    const service = makeService();
    const emojis = ['❤️', '😂', '😮', '😢', '🔥'];

    const results = await Promise.allSettled(
      emojis.flatMap((emoji) =>
        Array.from({ length: 4 }, () =>
          service.createReaction({
            confessionId: confession.id,
            anonymousUserId: reactor.id,
            emoji,
          } as any),
        ),
      ),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r: any) => r.reason?.message)).toEqual([]);

    const rows = await ds.getRepository(Reaction).find({
      where: { confession: { id: confession.id } },
    });
    expect(rows).toHaveLength(1);
    expect(emojis).toContain(rows[0].emoji);
  });
});
