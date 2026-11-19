import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MigrationVerificationService } from './migration-verification.service';

const runWithPostgres =
  process.env.CI === 'true' && process.env.DB_HOST ? describe : describe.skip;

runWithPostgres('MigrationVerificationService (PostgreSQL)', () => {
  let dataSource: DataSource;
  let parentTable: string;
  let childTable: string;
  let childIndex: string;

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
    parentTable = `fk_parent_${suffix}`;
    childTable = `fk_child_${suffix}`;
    childIndex = `idx_${childTable}_parent`;
    await dataSource.query(
      `CREATE TABLE "${parentTable}" (id integer PRIMARY KEY)`,
    );
    await dataSource.query(`
      CREATE TABLE "${childTable}" (
        id integer PRIMARY KEY,
        parent_id integer NOT NULL REFERENCES "${parentTable}"(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await dataSource.query(
      `CREATE INDEX "${childIndex}" ON "${childTable}" (parent_id)`,
    );

    Object.defineProperty(dataSource, 'entityMetadatas', {
      configurable: true,
      value: [
        {
          tableName: childTable,
          relations: [
            {
              isOwning: true,
              joinColumns: [
                {
                  databaseName: 'parent_id',
                  referencedColumn: { databaseName: 'id' },
                },
              ],
              inverseEntityMetadata: { tableName: parentTable },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            },
          ],
        },
      ],
    });
  });

  afterEach(async () => {
    await dataSource.query(`DROP TABLE IF EXISTS "${childTable}" CASCADE`);
    await dataSource.query(`DROP TABLE IF EXISTS "${parentTable}" CASCADE`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('validates foreign-key actions and indexes and confirms cascade behavior', async () => {
    const service = new MigrationVerificationService(dataSource);
    await expect(service.checkForeignKeyIntegrity()).resolves.toEqual({
      ok: true,
      missingForeignKeys: [],
      missingIndexes: [],
    });

    await dataSource.query(`INSERT INTO "${parentTable}" (id) VALUES (1)`);
    await dataSource.query(
      `INSERT INTO "${childTable}" (id, parent_id) VALUES (1, 1)`,
    );
    await dataSource.query(`UPDATE "${parentTable}" SET id = 2 WHERE id = 1`);
    await expect(
      dataSource.query(`SELECT parent_id FROM "${childTable}" WHERE id = 1`),
    ).resolves.toEqual([{ parent_id: 2 }]);
    await dataSource.query(`DELETE FROM "${parentTable}" WHERE id = 2`);
    await expect(
      dataSource.query(`SELECT id FROM "${childTable}"`),
    ).resolves.toEqual([]);
  });

  it('reports absent referencing indexes and incorrect delete behavior', async () => {
    await dataSource.query(`DROP INDEX "${childIndex}"`);
    await dataSource.query(
      `ALTER TABLE "${childTable}" DROP CONSTRAINT "${childTable}_parent_id_fkey"`,
    );
    await dataSource.query(`
      ALTER TABLE "${childTable}" ADD CONSTRAINT "${childTable}_parent_id_fkey"
      FOREIGN KEY (parent_id) REFERENCES "${parentTable}"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    const result = await new MigrationVerificationService(
      dataSource,
    ).checkForeignKeyIntegrity();
    expect(result.ok).toBe(false);
    expect(result.missingForeignKeys).toContain(
      `${childTable}(parent_id) -> ${parentTable}(id)`,
    );
    expect(result.missingIndexes).toContain(`${childTable}(parent_id)`);
  });
});
