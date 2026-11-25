import type { DataSource } from 'typeorm';

/**
 * Migration drift detection.
 *
 * Compares the migrations shipped with this build (the TypeORM migration
 * classes the DataSource loaded) with the rows recorded in the deployed
 * database's migrations table:
 *
 *  - pending     shipped with the code but not applied to the database.
 *                Deploying would run against a schema the code does not expect.
 *  - unexpected  recorded in the database but unknown to this build. Usually a
 *                rollback to older code, or a migration applied from another
 *                branch. Reported, but only fails when explicitly configured.
 *
 * The report never includes connection strings, credentials or raw driver
 * errors — only migration names, counts and fixed hints.
 */

export type MigrationDriftStatus =
  | 'in_sync'
  | 'pending'
  | 'unexpected'
  | 'pending_and_unexpected'
  | 'skipped'
  | 'error';

export interface MigrationDriftResult {
  /** False when required migrations are pending or the check errored. */
  ok: boolean;
  status: MigrationDriftStatus;
  expectedCount: number;
  appliedCount: number;
  pending: string[];
  unexpected: string[];
  migrationsTable: string;
  migrationsTableExists: boolean;
  /** Present when the comparison could not be made (status `skipped`). */
  skippedReason?: string;
  /** Stable, secret-free error label (status `error`). */
  errorCode?: 'QUERY_FAILED' | 'INVALID_TABLE_NAME';
}

export const DEFAULT_MIGRATIONS_TABLE = 'migrations';

/** Same naming rule TypeORM applies when it records a migration. */
export function migrationName(migration: {
  name?: string;
  constructor: { name: string };
}): string {
  return migration.name || migration.constructor.name;
}

/** Pure comparison of shipped and applied migration names. */
export function computeMigrationDrift(
  expectedNames: readonly string[],
  appliedNames: readonly string[],
  options: { migrationsTable?: string; migrationsTableExists?: boolean } = {},
): MigrationDriftResult {
  const expected = new Set(expectedNames);
  const applied = new Set(appliedNames);

  const pending = [...expected].filter((name) => !applied.has(name));
  const unexpected = [...applied].filter((name) => !expected.has(name));

  let status: MigrationDriftStatus = 'in_sync';
  if (pending.length > 0 && unexpected.length > 0) {
    status = 'pending_and_unexpected';
  } else if (pending.length > 0) {
    status = 'pending';
  } else if (unexpected.length > 0) {
    status = 'unexpected';
  }

  return {
    ok: pending.length === 0,
    status,
    expectedCount: expected.size,
    appliedCount: applied.size,
    pending,
    unexpected,
    migrationsTable: options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE,
    migrationsTableExists: options.migrationsTableExists ?? true,
  };
}

const SAFE_TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/**
 * Read the migrations table of `dataSource` and compare it with the
 * migrations the DataSource loaded. The DataSource must be initialized.
 */
export async function inspectMigrationDrift(
  dataSource: DataSource,
): Promise<MigrationDriftResult> {
  const options = (dataSource.options ?? {}) as {
    migrationsTableName?: string;
    synchronize?: boolean;
  };
  const migrationsTable = options.migrationsTableName || DEFAULT_MIGRATIONS_TABLE;
  const expectedNames = (dataSource.migrations ?? []).map((migration) =>
    migrationName(migration as unknown as { name?: string; constructor: { name: string } }),
  );

  const base = {
    expectedCount: new Set(expectedNames).size,
    appliedCount: 0,
    pending: [] as string[],
    unexpected: [] as string[],
    migrationsTable,
    migrationsTableExists: false,
  };

  if (!SAFE_TABLE_NAME.test(migrationsTable)) {
    return { ...base, ok: false, status: 'error', errorCode: 'INVALID_TABLE_NAME' };
  }

  if (expectedNames.length === 0) {
    return {
      ...base,
      ok: true,
      status: 'skipped',
      skippedReason:
        'No migrations are loaded by this build, so there is nothing to compare.',
    };
  }

  try {
    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass($1::text) IS NOT NULL AS "exists"`,
      [migrationsTable],
    );

    if (!exists) {
      if (options.synchronize) {
        return {
          ...base,
          ok: true,
          status: 'skipped',
          skippedReason:
            'TYPEORM_SYNCHRONIZE is enabled and no migrations table exists; the schema is managed by synchronize (local development only).',
        };
      }
      return computeMigrationDrift(expectedNames, [], {
        migrationsTable,
        migrationsTableExists: false,
      });
    }

    const rows = await dataSource.query<{ name: string }[]>(
      `SELECT "name" FROM "${migrationsTable}"`,
    );
    return computeMigrationDrift(
      expectedNames,
      rows.map((row) => row.name),
      { migrationsTable, migrationsTableExists: true },
    );
  } catch {
    // The raw error can contain host or role names; callers log it separately
    // if they need to. The result only carries a stable code.
    return { ...base, ok: false, status: 'error', errorCode: 'QUERY_FAILED' };
  }
}

export const MIGRATION_DRIFT_HINTS = {
  pending:
    'Apply pending migrations before routing traffic: `npm run backend:migration:run` (production runs them on boot when TYPEORM_MIGRATIONS_RUN is not false).',
  unexpected:
    'The database has migrations this build does not ship. Deploy the build that contains them, or confirm the rollback is intended (set MIGRATION_DRIFT_FAIL_ON_UNEXPECTED=true to block on this).',
  error:
    'Could not read the migrations table. Confirm the database is reachable and the application role can SELECT from it; see backend logs tagged migration_drift.',
} as const;

function listNames(names: string[], limit: number): string {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} (+${names.length - limit} more)`;
}

/** Human-readable, secret-free report used by the CLI and logs. */
export function formatMigrationDriftReport(
  result: MigrationDriftResult,
  limit = 20,
): string {
  const lines = [
    `Migration drift: ${result.status}`,
    `  table: ${result.migrationsTable} (${result.migrationsTableExists ? 'present' : 'missing'})`,
    `  shipped: ${result.expectedCount}, applied: ${result.appliedCount}`,
  ];
  if (result.skippedReason) lines.push(`  skipped: ${result.skippedReason}`);
  if (result.pending.length > 0) {
    lines.push(`  pending (${result.pending.length}): ${listNames(result.pending, limit)}`);
    lines.push(`  fix: ${MIGRATION_DRIFT_HINTS.pending}`);
  }
  if (result.unexpected.length > 0) {
    lines.push(
      `  unexpected (${result.unexpected.length}): ${listNames(result.unexpected, limit)}`,
    );
    lines.push(`  note: ${MIGRATION_DRIFT_HINTS.unexpected}`);
  }
  if (result.status === 'error') {
    lines.push(`  error: ${result.errorCode}`);
    lines.push(`  fix: ${MIGRATION_DRIFT_HINTS.error}`);
  }
  return lines.join('\n');
}
