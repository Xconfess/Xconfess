/**
 * Migration drift detection against a real, disposable PostgreSQL database.
 *
 * Each run creates a uniquely named database, applies migrations to it, checks
 * drift in every direction, and drops the database again — it never touches
 * the configured application database.
 *
 * Runs when PG_INTEGRATION=true, or in CI when DB_HOST is set.
 */
import { randomUUID } from 'node:crypto';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { inspectMigrationDrift } from './migration-drift';

const shouldRun =
  process.env.PG_INTEGRATION === 'true' ||
  (process.env.CI === 'true' && Boolean(process.env.DB_HOST));
const describePostgres = shouldRun ? describe : describe.skip;

class CreateDriftWidgets1700000000001 implements MigrationInterface {
  name = 'CreateDriftWidgets1700000000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "drift_widgets" ("id" serial PRIMARY KEY, "name" text NOT NULL)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "drift_widgets"');
  }
}

class AddDriftWidgetColor1700000000002 implements MigrationInterface {
  name = 'AddDriftWidgetColor1700000000002';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "drift_widgets" ADD COLUMN "color" text');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "drift_widgets" DROP COLUMN "color"');
  }
}

function connectionOptions(database: string) {
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database,
    entities: [],
    synchronize: false,
  };
}

describePostgres('migration drift (disposable PostgreSQL database)', () => {
  const databaseName = `xconfess_drift_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  let admin: DataSource;

  const openTarget = async (
    migrations: Array<new () => MigrationInterface>,
  ): Promise<DataSource> => {
    const ds = new DataSource({ ...connectionOptions(databaseName), migrations });
    await ds.initialize();
    return ds;
  };

  beforeAll(async () => {
    admin = new DataSource(
      connectionOptions(process.env.DB_NAME ?? 'postgres'),
    );
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  });

  afterAll(async () => {
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    }
  });

  it('walks a deployment from empty to in sync and detects drift both ways', async () => {
    // 1. Fresh database: no migrations table, everything is pending.
    let ds = await openTarget([CreateDriftWidgets1700000000001]);
    try {
      expect(await inspectMigrationDrift(ds)).toMatchObject({
        ok: false,
        status: 'pending',
        migrationsTableExists: false,
        pending: ['CreateDriftWidgets1700000000001'],
      });

      await ds.runMigrations();
      expect(await inspectMigrationDrift(ds)).toMatchObject({
        ok: true,
        status: 'in_sync',
        appliedCount: 1,
      });
    } finally {
      await ds.destroy();
    }

    // 2. A new build ships one more migration: readiness must see it pending.
    ds = await openTarget([
      CreateDriftWidgets1700000000001,
      AddDriftWidgetColor1700000000002,
    ]);
    try {
      expect(await inspectMigrationDrift(ds)).toMatchObject({
        ok: false,
        status: 'pending',
        pending: ['AddDriftWidgetColor1700000000002'],
        migrationsTableExists: true,
      });

      await ds.runMigrations();
      expect(await inspectMigrationDrift(ds)).toMatchObject({
        ok: true,
        status: 'in_sync',
        appliedCount: 2,
      });
    } finally {
      await ds.destroy();
    }

    // 3. Rolling back to the old build: the DB has a migration it does not ship.
    ds = await openTarget([CreateDriftWidgets1700000000001]);
    try {
      const result = await inspectMigrationDrift(ds);
      expect(result).toMatchObject({
        ok: true,
        status: 'unexpected',
        unexpected: ['AddDriftWidgetColor1700000000002'],
      });
      // Diagnostics never carry connection details.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(process.env.DB_PASSWORD ?? 'postgres-password');
      expect(serialized).not.toContain(databaseName);
    } finally {
      await ds.destroy();
    }
  });
});
