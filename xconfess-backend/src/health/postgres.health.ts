import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PostgresHealthDetail {
  status: 'up' | 'down';
  latencyMs?: number;
  version?: string;
  activeConnections?: number;
  maxConnections?: number;
  error?: string;
  hint?: string;
}

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(PostgresHealthIndicator.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const detail: PostgresHealthDetail = { status: 'down' };

    try {
      // Measure connection latency via a simple query
      const start = Date.now();
      const versionResult = await this.dataSource.query<
        { version: string }[]
      >('SELECT version()');
      detail.latencyMs = Date.now() - start;

      if (versionResult.length > 0) {
        // Extract short version label (e.g. "PostgreSQL 16.3")
        const full = versionResult[0].version;
        const match = full.match(/^PostgreSQL\s+[\d.]+/);
        detail.version = match ? match[0] : full.split(',')[0];
      }

      // Retrieve active and max connection counts
      const [connResult] = await this.dataSource.query<
        { active: string; max: string }[]
      >(`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::text AS active,
          (SELECT setting FROM pg_settings WHERE name = 'max_connections') AS max
      `);

      detail.activeConnections = parseInt(connResult.active, 10);
      detail.maxConnections = parseInt(connResult.max, 10);
      detail.status = 'up';

      return this.getStatus(key, true, detail);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Postgres health check failed: ${message}`);

      detail.error = message;
      detail.hint = this.resolveActionableHint(message);

      throw new HealthCheckError(
        'Postgres is unreachable',
        this.getStatus(key, false, detail),
      );
    }
  }

  private resolveActionableHint(errorMessage: string): string {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('econnrefused')) {
      return 'Database server is not accepting connections. Verify the host and port in DATABASE_HOST / DATABASE_PORT, and ensure PostgreSQL is running.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'Connection timed out. Check network connectivity and PostgreSQL pg_hba.conf rules for the application host.';
    }
    if (
      lower.includes('password authentication failed') ||
      lower.includes('role') ||
      lower.includes('does not exist')
    ) {
      return 'Authentication failed. Verify DATABASE_USER and DATABASE_PASSWORD environment variables.';
    }
    if (lower.includes('too many connections') || lower.includes('remaining connection slots are reserved')) {
      return 'Connection pool exhausted. Increase max_connections in postgresql.conf or reduce pool size in the application.';
    }
    if (lower.includes('ssl')) {
      return 'SSL negotiation failed. Check DATABASE_SSL configuration and the server certificate.';
    }

    return 'Check backend logs for the full error. Verify DATABASE_HOST, DATABASE_PORT, DATABASE_USER, and DATABASE_PASSWORD.';
  }
}
