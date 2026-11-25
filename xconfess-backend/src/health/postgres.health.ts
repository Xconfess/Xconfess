import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  buildDependencyDetail,
  classifyDependencyError,
  DependencyErrorCode,
  resolveDependencyTimeoutMs,
  summarizeDependencyError,
  withDependencyTimeout,
} from './dependency-check';

function resolveActionableHint(code: DependencyErrorCode): string {
  switch (code) {
    case 'CONNECTION_REFUSED':
      return 'Database server is not accepting connections. Verify the host and port in DATABASE_HOST / DATABASE_PORT, and ensure PostgreSQL is running.';
    case 'TIMEOUT':
      return 'Connection timed out. Check network connectivity and PostgreSQL pg_hba.conf rules for the application host, or raise HEALTH_DATABASE_TIMEOUT_MS.';
    case 'AUTH_FAILED':
      return 'Authentication failed. Verify DATABASE_USER and DATABASE_PASSWORD environment variables.';
    case 'RESOURCE_EXHAUSTED':
      return 'Connection pool exhausted. Increase max_connections in postgresql.conf or reduce pool size in the application.';
    case 'TLS_FAILED':
      return 'SSL negotiation failed. Check DATABASE_SSL configuration and the server certificate.';
    case 'DNS_LOOKUP_FAILED':
      return 'Database host could not be resolved. Verify DATABASE_HOST.';
    default:
      return 'Check backend logs for the full error. Verify DATABASE_HOST, DATABASE_PORT, DATABASE_USER, and DATABASE_PASSWORD.';
  }
}

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(PostgresHealthIndicator.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeoutMs = resolveDependencyTimeoutMs(
      this.configService,
      'database',
    );
    const start = Date.now();

    try {
      const details = await withDependencyTimeout(
        'database',
        timeoutMs,
        async () => {
          const versionResult = await this.dataSource.query<
            { version: string }[]
          >('SELECT version()');

          let version: string | undefined;
          if (versionResult.length > 0) {
            // Extract short version label (e.g. "PostgreSQL 16.3")
            const full = versionResult[0].version;
            const match = full.match(/^PostgreSQL\s+[\d.]+/);
            version = match ? match[0] : full.split(',')[0];
          }

          const [connResult] = await this.dataSource.query<
            { active: string; max: string }[]
          >(`
            SELECT
              (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::text AS active,
              (SELECT setting FROM pg_settings WHERE name = 'max_connections') AS max
          `);

          return {
            version,
            activeConnections: parseInt(connResult.active, 10),
            maxConnections: parseInt(connResult.max, 10),
          };
        },
      );

      return {
        [key]: buildDependencyDetail({
          dependency: 'database',
          state: 'up',
          timeoutMs,
          latencyMs: Date.now() - start,
          message: 'PostgreSQL is reachable',
          details,
        }),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // The raw driver message can contain host names; keep it in logs only.
      this.logger.error(`Postgres health check failed: ${message}`);

      const errorCode = classifyDependencyError(error);
      throw new HealthCheckError('Postgres is unreachable', {
        [key]: buildDependencyDetail({
          dependency: 'database',
          state: 'down',
          timeoutMs,
          latencyMs: null,
          message: `PostgreSQL ${summarizeDependencyError(errorCode)}`,
          errorCode,
          hint: resolveActionableHint(errorCode),
        }),
      });
    }
  }
}
