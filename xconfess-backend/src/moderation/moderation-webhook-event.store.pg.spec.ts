/**
 * ModerationWebhookEventStore against a disposable PostgreSQL database, using
 * the real migration. Runs when PG_INTEGRATION=true (or in CI with DB_HOST).
 */
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ModerationWebhookEvent } from './entities/moderation-webhook-event.entity';
import { ModerationWebhookEventStore } from './moderation-webhook-event.store';
import { CreateModerationWebhookEvents20261119000001 } from '../migrations/20261119000001-create-moderation-webhook-events';

const shouldRun =
  process.env.PG_INTEGRATION === 'true' ||
  (process.env.CI === 'true' && Boolean(process.env.DB_HOST));
const describePostgres = shouldRun ? describe : describe.skip;

const base = {
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
};

describePostgres('ModerationWebhookEventStore (PostgreSQL)', () => {
  const databaseName = `xconfess_webhook_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  let admin: DataSource;
  let ds: DataSource;
  let store: ModerationWebhookEventStore;

  const record = (eventId: string, payloadHash = 'a'.repeat(64)) => ({
    eventId,
    payloadHash,
    confessionId: 'conf-1',
    signedAt: new Date(),
  });

  beforeAll(async () => {
    admin = new DataSource({ ...base, database: process.env.DB_NAME ?? 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    ds = new DataSource({
      ...base,
      database: databaseName,
      entities: [ModerationWebhookEvent],
      migrations: [CreateModerationWebhookEvents20261119000001],
      synchronize: false,
    });
    await ds.initialize();
    await ds.runMigrations();
    store = new ModerationWebhookEventStore(ds.getRepository(ModerationWebhookEvent));
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    }
  });

  it('claims an event once and classifies later deliveries', async () => {
    const eventId = `evt-${randomUUID()}`;

    await expect(
      ds.transaction((m) => store.claim(m, record(eventId))),
    ).resolves.toBe('claimed');
    await expect(
      ds.transaction((m) => store.claim(m, record(eventId))),
    ).resolves.toBe('duplicate');
    await expect(
      ds.transaction((m) => store.claim(m, record(eventId, 'b'.repeat(64)))),
    ).resolves.toBe('conflict');
    await expect(store.find(eventId)).resolves.toMatchObject({
      eventId,
      payloadHash: 'a'.repeat(64),
    });
  });

  it('lets exactly one of several concurrent deliveries claim the event', async () => {
    const eventId = `evt-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ds.transaction((m) => store.claim(m, record(eventId))),
      ),
    );

    expect(results.filter((r) => r === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r === 'duplicate')).toHaveLength(4);
  });

  it('rolls the claim back when processing fails, so a retry can claim it', async () => {
    const eventId = `evt-${randomUUID()}`;

    await expect(
      ds.transaction(async (m) => {
        await store.claim(m, record(eventId));
        throw new Error('processing failed');
      }),
    ).rejects.toThrow('processing failed');
    await expect(store.find(eventId)).resolves.toBeNull();

    await expect(
      ds.transaction((m) => store.claim(m, record(eventId))),
    ).resolves.toBe('claimed');
  });

  it('prunes only records older than the cutoff', async () => {
    const oldId = `evt-old-${randomUUID()}`;
    const freshId = `evt-new-${randomUUID()}`;
    await ds.transaction((m) => store.claim(m, record(oldId)));
    await ds.transaction((m) => store.claim(m, record(freshId)));
    await ds.query(
      `UPDATE "moderation_webhook_events" SET "processed_at" = now() - interval '10 days' WHERE "event_id" = $1`,
      [oldId],
    );

    const removed = await store.pruneOlderThan(new Date(Date.now() - 86_400_000));
    expect(removed).toBeGreaterThanOrEqual(1);
    await expect(store.find(oldId)).resolves.toBeNull();
    await expect(store.find(freshId)).resolves.not.toBeNull();
  });

  it('migration down removes the table', async () => {
    await ds.undoLastMigration();
    const [{ exists }] = await ds.query(
      `SELECT to_regclass('moderation_webhook_events') IS NOT NULL AS "exists"`,
    );
    expect(exists).toBe(false);
  });
});
