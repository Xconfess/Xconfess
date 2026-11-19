/**
 * Pre-deployment migration drift check.
 *
 *   npm run backend:migration:drift
 *
 * Connects with the same settings as `migration:run` (data-source.ts),
 * compares the migrations shipped with this checkout against the target
 * database's migrations table, and exits non-zero when required migrations
 * are pending (or, with --fail-on-unexpected, when the database has
 * migrations this build does not know about).
 *
 * Output contains only migration names, counts and fixed hints — never
 * connection strings, credentials or raw driver errors.
 */
import dataSource from '../data-source';
import {
  formatMigrationDriftReport,
  inspectMigrationDrift,
} from '../src/database/migration-drift';

function redact(message: string): string {
  let safe = message;
  for (const secret of [process.env.DB_PASSWORD, process.env.DB_USERNAME]) {
    if (secret) safe = safe.split(secret).join('[redacted]');
  }
  return safe;
}

async function main(): Promise<void> {
  const failOnUnexpected =
    process.argv.includes('--fail-on-unexpected') ||
    process.env.MIGRATION_DRIFT_FAIL_ON_UNEXPECTED === 'true';
  const asJson = process.argv.includes('--json');

  try {
    await dataSource.initialize();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `Migration drift check could not connect to the database: ${redact(message)}`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectMigrationDrift(dataSource);

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatMigrationDriftReport(result, 50));
    }

    const blockedByUnexpected =
      failOnUnexpected && result.unexpected.length > 0;
    if (!result.ok || blockedByUnexpected) {
      console.error(
        blockedByUnexpected && result.ok
          ? 'Migration drift check failed: unexpected migrations recorded in the database.'
          : 'Migration drift check failed: the database is not ready for this build.',
      );
      process.exitCode = 1;
      return;
    }

    console.log('Migration drift check passed.');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void main();
