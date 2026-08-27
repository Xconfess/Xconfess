import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable } from '@nestjs/common';
import { MigrationVerificationService } from '../database/migration-verification.service';

/**
 * Exposes confession-table migration readiness on `GET /api/health` (Terminus).
 *
 * When columns or indexes are missing the check fails with structured details
 * that identify exactly which migrations are outstanding — so contributors can
 * diagnose the problem without reading backend logs.
 *
 * No secrets or connection strings are ever included in the response body.
 */
@Injectable()
export class SchemaReadinessHealthIndicator extends HealthIndicator {
  constructor(
    private readonly migrationVerification: MigrationVerificationService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const result = await this.migrationVerification.checkConfessionSchema();

    if (result.queryError) {
      throw new HealthCheckError(
        'Schema readiness query failed',
        this.getStatus(key, false, {
          table: 'anonymous_confessions',
          reason: 'Unable to query schema information — the database may be unavailable or the role lacks SELECT on information_schema.',
          // Redact the raw DB error; it may contain connection details.
          // Contributors should check backend logs tagged schema_readiness for
          // the full message.
          hint: 'Run pending migrations: `npm run backend:migration:run` (or check the MigrationVerificationService log output tagged schema_readiness_error).',
        }),
      );
    }

    if (!result.ok) {
      throw new HealthCheckError(
        'anonymous_confessions schema out of sync with migrations',
        this.getStatus(key, false, {
          table: 'anonymous_confessions',
          missingColumns: result.missingColumns,
          missingIndexes: result.missingIndexes,
          hint: 'Run `npm run backend:migration:run` (clean database) or `npm run backend:schema:repair` (existing dev database). Check the migrations/ and src/migrations/ directories for any unapplied files.',
        }),
      );
    }

    return this.getStatus(key, true, {
      table: 'anonymous_confessions',
      columns: 'all required columns present',
      indexes: 'all required indexes present',
    });
  }
}