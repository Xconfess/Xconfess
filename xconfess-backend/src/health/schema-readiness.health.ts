import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable } from '@nestjs/common';
import { MigrationVerificationService } from '../database/migration-verification.service';

/**
 * Exposes confession-table migration readiness on `GET /api/health` (Terminus).
 * When columns or indexes are missing, the health check fails with structured details.
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
          error: result.queryError,
        }),
      );
    }

    if (!result.ok) {
      throw new HealthCheckError(
        'anonymous_confessions schema out of sync with migrations',
        this.getStatus(key, false, {
          missingColumns: result.missingColumns,
          missingIndexes: result.missingIndexes,
        }),
      );
    }

    return this.getStatus(key, true, {
      table: 'anonymous_confessions',
      columns: 'required present',
      indexes: 'required present',
    });
  }
}
