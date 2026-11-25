import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AddUniqueReactionConstraint20260725000003 } from '../src/migrations/20260725000003-add-unique-reaction-constraint';

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

describePostgres('Reaction uniqueness under concurrent writes (PostgreSQL)', () => {
  const databaseName = `xconfess_reaction_race_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  let admin: DataSource;
  let ds: DataSource;
  const confessionId = randomUUID();
  const anonymousUserId = randomUUID();

  const insertReaction = () =>
    ds.transaction(async (manager) => {
      await manager.query('SAVEPOINT reaction_insert');
      try {
        await manager.query(
          `INSERT INTO "reaction" ("id", "emoji", "confession_id", "anonymous_user_id", "created_at")
           VALUES ($1, $2, $3, $4, NOW())`,
          [randomUUID(), 'heart', confessionId, anonymousUserId],
        );
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== '23505') throw error;
        await manager.query('ROLLBACK TO SAVEPOINT reaction_insert');
      }
    });

  beforeAll(async () => {
    admin = new DataSource({ ...base, database: process.env.DB_NAME ?? 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    ds = new DataSource({
      ...base,
      database: databaseName,
      entities: [],
      migrations: [AddUniqueReactionConstraint20260725000003],
      synchronize: false,
    });
    await ds.initialize();
    await ds.query(`
      CREATE TABLE "reaction" (
        "id" uuid PRIMARY KEY,
        "emoji" text NOT NULL,
        "confession_id" uuid NOT NULL,
        "anonymous_user_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await ds.runMigrations();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    }
  });

  it('keeps one row and one total when identical inserts race', async () => {
    await Promise.all(Array.from({ length: 8 }, insertReaction));

    const rows = await ds.query(
      `SELECT id FROM "reaction" WHERE "confession_id" = $1 AND "anonymous_user_id" = $2`,
      [confessionId, anonymousUserId],
    );
    const count = await ds.query(
      `SELECT COUNT(*)::int AS count FROM "reaction" WHERE "confession_id" = $1`,
      [confessionId],
    );

    expect(rows).toHaveLength(1);
    expect(count[0].count).toBe(1);
  });
});
