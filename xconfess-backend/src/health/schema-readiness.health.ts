import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MigrationVerificationService,
  SchemaReadinessResult,
} from '../database/migration-verification.service';
import {
  MIGRATION_DRIFT_HINTS,
  MigrationDriftResult,
} from '../database/migration-drift';
import {
  buildDependencyDetail,
  DependencyCheckDetail,
  DependencyErrorCode,
  DependencyState,
  resolveDependencyTimeoutMs,
  summarizeDependencyError,
  withDependencyTimeout,
} from './dependency-check';

export type MigrationDriftMode = 'enforce' | 'warn' | 'off';

/** Names listed in a readiness response; the full list is in the logs/CLI. */
const MAX_LISTED_MIGRATIONS = 20;

export function resolveMigrationDriftMode(raw: unknown): MigrationDriftMode {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'warn' || value === 'off') return value;
  return 'enforce';
}

function isTrue(raw: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(raw ?? '').trim().toLowerCase(),
  );
}

function summarizeDrift(
  drift: MigrationDriftResult,
  mode: MigrationDriftMode,
): Record<string, unknown> {
  return {
    mode,
    status: drift.status,
    migrationsTable: drift.migrationsTable,
    migrationsTableExists: drift.migrationsTableExists,
    shipped: drift.expectedCount,
    applied: drift.appliedCount,
    pendingCount: drift.pending.length,
    pending: drift.pending.slice(0, MAX_LISTED_MIGRATIONS),
    unexpectedCount: drift.unexpected.length,
    unexpected: drift.unexpected.slice(0, MAX_LISTED_MIGRATIONS),
    ...(drift.skippedReason ? { skippedReason: drift.skippedReason } : {}),
    ...(drift.errorCode ? { errorCode: drift.errorCode } : {}),
  };
}

/**
 * Schema readiness for `/api/health/ready`.
 *
 * Combines two checks:
 *  1. required confession columns / indexes are present, and
 *  2. migration drift — the migrations shipped with this build match the
 *     migrations recorded in the deployed database.
 *
 * Pending migrations fail readiness (unless MIGRATION_DRIFT_CHECK=warn|off).
 * Migrations recorded in the database but unknown to this build are reported
 * as `degraded`, and only fail when MIGRATION_DRIFT_FAIL_ON_UNEXPECTED=true,
 * so a deliberate rollback is not blocked.
 *
 * No secrets, connection strings or raw driver errors are included.
 */
@Injectable()
export class SchemaReadinessHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(SchemaReadinessHealthIndicator.name);

  constructor(
    private readonly migrationVerification: MigrationVerificationService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeoutMs = resolveDependencyTimeoutMs(this.configService, 'schema');
    const mode = resolveMigrationDriftMode(
      this.configService?.get('MIGRATION_DRIFT_CHECK'),
    );
    const failOnUnexpected = isTrue(
      this.configService?.get('MIGRATION_DRIFT_FAIL_ON_UNEXPECTED'),
    );
    const start = Date.now();

    let schema: SchemaReadinessResult;
    let drift: MigrationDriftResult | undefined;
    try {
      [schema, drift] = await withDependencyTimeout(
        'schema',
        timeoutMs,
        async () =>
          Promise.all([
            this.migrationVerification.checkConfessionSchema(),
            mode === 'off'
              ? Promise.resolve(undefined)
              : this.migrationVerification.checkMigrationDrift(),
          ]),
      );
    } catch (error: unknown) {
      this.logger.error(
        `schema_readiness_error ${error instanceof Error ? error.message : String(error)}`,
      );
      throw this.fail(key, {
        timeoutMs,
        state: 'down',
        errorCode: 'TIMEOUT',
        message: `Schema check ${summarizeDependencyError('TIMEOUT')}`,
        hint: 'The schema queries did not finish in time. Check database load, or raise HEALTH_SCHEMA_TIMEOUT_MS.',
        details: { table: 'anonymous_confessions' },
      });
    }

    const latencyMs = Date.now() - start;
    const driftDetails = drift ? summarizeDrift(drift, mode) : { mode };
    const details: Record<string, unknown> = {
      table: 'anonymous_confessions',
      migrations: driftDetails,
    };

    if (schema.queryError) {
      // The raw DB error is redacted; it may contain connection details.
      throw this.fail(key, {
        timeoutMs,
        latencyMs,
        state: 'down',
        errorCode: 'QUERY_FAILED',
        message: 'Unable to query schema information',
        hint: 'The database may be unavailable or the role lacks SELECT on information_schema. Check backend logs tagged schema_readiness_error, then run `npm run backend:migration:run`.',
        details,
      });
    }

    if (drift && mode === 'enforce' && drift.status === 'error') {
      throw this.fail(key, {
        timeoutMs,
        latencyMs,
        state: 'down',
        errorCode: 'QUERY_FAILED',
        message: 'Unable to read the migrations table',
        hint: MIGRATION_DRIFT_HINTS.error,
        details,
      });
    }

    if (drift && mode === 'enforce' && drift.pending.length > 0) {
      throw this.fail(key, {
        timeoutMs,
        latencyMs,
        state: 'down',
        errorCode: 'PENDING_MIGRATIONS',
        message: `${drift.pending.length} required migration(s) pending`,
        hint: MIGRATION_DRIFT_HINTS.pending,
        details,
      });
    }

    if (
      drift &&
      mode === 'enforce' &&
      failOnUnexpected &&
      drift.unexpected.length > 0
    ) {
      throw this.fail(key, {
        timeoutMs,
        latencyMs,
        state: 'down',
        errorCode: 'SCHEMA_DRIFT',
        message: `${drift.unexpected.length} unexpected migration(s) recorded in the database`,
        hint: MIGRATION_DRIFT_HINTS.unexpected,
        details,
      });
    }

    if (!schema.ok) {
      details.missingColumns = schema.missingColumns;
      details.missingIndexes = schema.missingIndexes;
      throw this.fail(key, {
        timeoutMs,
        latencyMs,
        state: 'down',
        errorCode: 'SCHEMA_DRIFT',
        message: 'anonymous_confessions schema out of sync with migrations',
        hint: 'Run `npm run backend:migration:run` (clean database) or `npm run backend:schema:repair` (existing dev database). Check the migrations/ and src/migrations/ directories for any unapplied files.',
        details,
      });
    }

    if (
      drift &&
      (drift.pending.length > 0 ||
        drift.unexpected.length > 0 ||
        drift.status === 'error')
    ) {
      return {
        [key]: buildDependencyDetail({
          dependency: 'schema',
          state: 'degraded',
          timeoutMs,
          latencyMs,
          message: `Migration drift detected (${drift.status})`,
          errorCode: drift.status === 'error' ? 'QUERY_FAILED' : 'SCHEMA_DRIFT',
          hint:
            drift.pending.length > 0
              ? MIGRATION_DRIFT_HINTS.pending
              : drift.status === 'error'
                ? MIGRATION_DRIFT_HINTS.error
                : MIGRATION_DRIFT_HINTS.unexpected,
          details,
        }),
      };
    }

    return {
      [key]: buildDependencyDetail({
        dependency: 'schema',
        state: 'up',
        timeoutMs,
        latencyMs,
        message: 'Schema matches the migrations shipped with this build',
        details,
      }),
    };
  }

  private fail(
    key: string,
    input: {
      timeoutMs: number;
      latencyMs?: number;
      state: DependencyState;
      errorCode: DependencyErrorCode;
      message: string;
      hint: string;
      details: Record<string, unknown>;
    },
  ): HealthCheckError {
    const detail: DependencyCheckDetail = buildDependencyDetail({
      dependency: 'schema',
      ...input,
    });
    return new HealthCheckError(input.message, { [key]: detail });
  }
}
