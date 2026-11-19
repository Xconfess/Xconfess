import { DataSource } from 'typeorm';
import {
  computeMigrationDrift,
  formatMigrationDriftReport,
  inspectMigrationDrift,
  migrationName,
} from './migration-drift';

class AddThing1700000000001 {
  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

class Named1700000000002 {
  name = 'ExplicitName1700000000002';
  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

function fakeDataSource(options: {
  migrations?: object[];
  tableExists?: boolean;
  applied?: string[];
  synchronize?: boolean;
  migrationsTableName?: string;
  failWith?: Error;
}): DataSource {
  const query = jest.fn(async (sql: string) => {
    if (options.failWith) throw options.failWith;
    if (sql.includes('to_regclass')) {
      return [{ exists: options.tableExists ?? true }];
    }
    return (options.applied ?? []).map((name) => ({ name }));
  });
  return {
    options: {
      synchronize: options.synchronize ?? false,
      migrationsTableName: options.migrationsTableName,
    },
    migrations: options.migrations ?? [],
    query,
  } as unknown as DataSource;
}

describe('migration drift', () => {
  describe('migrationName', () => {
    it('uses the explicit name, falling back to the class name', () => {
      expect(migrationName(new AddThing1700000000001() as any)).toBe(
        'AddThing1700000000001',
      );
      expect(migrationName(new Named1700000000002())).toBe(
        'ExplicitName1700000000002',
      );
    });
  });

  describe('computeMigrationDrift', () => {
    it('is in sync when every shipped migration is applied', () => {
      expect(computeMigrationDrift(['A', 'B'], ['B', 'A'])).toMatchObject({
        ok: true,
        status: 'in_sync',
        pending: [],
        unexpected: [],
        expectedCount: 2,
        appliedCount: 2,
      });
    });

    it('reports pending migrations as not ok', () => {
      expect(computeMigrationDrift(['A', 'B', 'C'], ['A'])).toMatchObject({
        ok: false,
        status: 'pending',
        pending: ['B', 'C'],
      });
    });

    it('reports unexpected migrations without failing', () => {
      expect(computeMigrationDrift(['A'], ['A', 'Z'])).toMatchObject({
        ok: true,
        status: 'unexpected',
        unexpected: ['Z'],
      });
    });

    it('reports both directions at once', () => {
      expect(computeMigrationDrift(['A', 'B'], ['A', 'Z'])).toMatchObject({
        ok: false,
        status: 'pending_and_unexpected',
        pending: ['B'],
        unexpected: ['Z'],
      });
    });

    it('ignores duplicate rows', () => {
      expect(computeMigrationDrift(['A'], ['A', 'A'])).toMatchObject({
        status: 'in_sync',
        appliedCount: 1,
      });
    });
  });

  describe('inspectMigrationDrift', () => {
    const shipped = [new AddThing1700000000001(), new Named1700000000002()];

    it('compares loaded migrations with the migrations table', async () => {
      const result = await inspectMigrationDrift(
        fakeDataSource({ migrations: shipped, applied: ['AddThing1700000000001'] }),
      );
      expect(result).toMatchObject({
        status: 'pending',
        pending: ['ExplicitName1700000000002'],
        migrationsTable: 'migrations',
        migrationsTableExists: true,
      });
    });

    it('treats a missing migrations table as everything pending', async () => {
      const result = await inspectMigrationDrift(
        fakeDataSource({ migrations: shipped, tableExists: false }),
      );
      expect(result).toMatchObject({
        ok: false,
        status: 'pending',
        migrationsTableExists: false,
        pending: ['AddThing1700000000001', 'ExplicitName1700000000002'],
      });
    });

    it('skips when synchronize manages the schema and no table exists', async () => {
      const result = await inspectMigrationDrift(
        fakeDataSource({ migrations: shipped, tableExists: false, synchronize: true }),
      );
      expect(result).toMatchObject({ ok: true, status: 'skipped' });
      expect(result.skippedReason).toContain('TYPEORM_SYNCHRONIZE');
    });

    it('skips when the build loads no migrations', async () => {
      const ds = fakeDataSource({ migrations: [] });
      const result = await inspectMigrationDrift(ds);
      expect(result).toMatchObject({ ok: true, status: 'skipped' });
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('honours a custom migrations table name', async () => {
      const ds = fakeDataSource({
        migrations: shipped,
        migrationsTableName: 'schema_history',
        applied: ['AddThing1700000000001', 'ExplicitName1700000000002'],
      });
      const result = await inspectMigrationDrift(ds);
      expect(result).toMatchObject({ status: 'in_sync', migrationsTable: 'schema_history' });
      expect(ds.query).toHaveBeenLastCalledWith('SELECT "name" FROM "schema_history"');
    });

    it('rejects unsafe table names without querying', async () => {
      const ds = fakeDataSource({
        migrations: shipped,
        migrationsTableName: 'migrations"; DROP TABLE users; --',
      });
      const result = await inspectMigrationDrift(ds);
      expect(result).toMatchObject({ ok: false, status: 'error', errorCode: 'INVALID_TABLE_NAME' });
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('returns a secret-free error when the query fails', async () => {
      const result = await inspectMigrationDrift(
        fakeDataSource({
          migrations: shipped,
          failWith: new Error('password authentication failed for user "admin"'),
        }),
      );
      expect(result).toMatchObject({ ok: false, status: 'error', errorCode: 'QUERY_FAILED' });
      expect(JSON.stringify(result)).not.toContain('admin');
    });
  });

  describe('formatMigrationDriftReport', () => {
    it('lists pending and unexpected names with actionable hints', () => {
      const report = formatMigrationDriftReport(
        computeMigrationDrift(['A', 'B'], ['A', 'Z']),
      );
      expect(report).toContain('Migration drift: pending_and_unexpected');
      expect(report).toContain('pending (1): B');
      expect(report).toContain('unexpected (1): Z');
      expect(report).toContain('migration:run');
    });

    it('truncates long lists', () => {
      const names = Array.from({ length: 5 }, (_, i) => `M${i}`);
      const report = formatMigrationDriftReport(computeMigrationDrift(names, []), 2);
      expect(report).toContain('pending (5): M0, M1 (+3 more)');
    });
  });
});
