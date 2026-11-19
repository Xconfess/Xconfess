import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

const runWithPostgres =
  process.env.CI === 'true' && process.env.DB_HOST ? describe : describe.skip;

runWithPostgres('confession side-effect transactions (PostgreSQL)', () => {
  let dataSource: DataSource;
  let anonTable: string;
  let confessionTable: string;
  let metadataTable: string;
  let notificationTable: string;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  beforeEach(async () => {
    const suffix = randomUUID().replace(/-/g, '');
    anonTable = `test_anon_${suffix}`;
    confessionTable = `test_confession_${suffix}`;
    metadataTable = `test_confession_metadata_${suffix}`;
    notificationTable = `test_notification_${suffix}`;

    await dataSource.query(
      `CREATE TABLE "${anonTable}" (id integer PRIMARY KEY)`,
    );
    await dataSource.query(`
      CREATE TABLE "${confessionTable}" (
        id integer PRIMARY KEY,
        anonymous_user_id integer NOT NULL REFERENCES "${anonTable}"(id) ON DELETE CASCADE
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${metadataTable}" (
        id integer PRIMARY KEY,
        confession_id integer NOT NULL REFERENCES "${confessionTable}"(id) ON DELETE CASCADE
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${notificationTable}" (
        id integer PRIMARY KEY,
        confession_id integer NOT NULL REFERENCES "${confessionTable}"(id) ON DELETE CASCADE
      )
    `);
  });

  afterEach(async () => {
    await dataSource.query(`DROP TABLE IF EXISTS "${notificationTable}"`);
    await dataSource.query(`DROP TABLE IF EXISTS "${metadataTable}"`);
    await dataSource.query(`DROP TABLE IF EXISTS "${confessionTable}"`);
    await dataSource.query(`DROP TABLE IF EXISTS "${anonTable}"`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('rolls back all dependent records after a post-confession failure', async () => {
    await expect(
      dataSource.transaction(async (manager) => {
        await manager.query(`INSERT INTO "${anonTable}" VALUES (1)`);
        await manager.query(`INSERT INTO "${confessionTable}" VALUES (1, 1)`);
        await manager.query(`INSERT INTO "${metadataTable}" VALUES (1, 1)`);
        await manager.query(`INSERT INTO "${notificationTable}" VALUES (1, 1)`);
        throw new Error('simulated dependent-side-effect failure');
      }),
    ).rejects.toThrow('simulated dependent-side-effect failure');

    for (const table of [
      anonTable,
      confessionTable,
      metadataTable,
      notificationTable,
    ]) {
      await expect(
        dataSource.query(`SELECT * FROM "${table}"`),
      ).resolves.toEqual([]);
    }
  });

  it('commits the confession and every dependent record on success', async () => {
    await dataSource.transaction(async (manager) => {
      await manager.query(`INSERT INTO "${anonTable}" VALUES (1)`);
      await manager.query(`INSERT INTO "${confessionTable}" VALUES (1, 1)`);
      await manager.query(`INSERT INTO "${metadataTable}" VALUES (1, 1)`);
      await manager.query(`INSERT INTO "${notificationTable}" VALUES (1, 1)`);
    });

    for (const table of [
      anonTable,
      confessionTable,
      metadataTable,
      notificationTable,
    ]) {
      await expect(
        dataSource.query(`SELECT * FROM "${table}"`),
      ).resolves.toHaveLength(1);
    }
  });
});
