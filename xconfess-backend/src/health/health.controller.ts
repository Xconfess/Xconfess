import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './redis.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { QueueHealthIndicator } from './queue.health';
import { PostgresHealthIndicator } from './postgres.health';

interface SubsystemStatus {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'disabled';
}

function getNestedStatuses(detail: Record<string, unknown>): string[] {
  return Object.values(detail)
    .filter((value): value is { status?: string } =>
      Boolean(value && typeof value === 'object' && 'status' in value),
    )
    .map((value) => value.status)
    .filter((status): status is string => Boolean(status));
}

function buildSubsystemSummary(
  result: HealthCheckResult,
): SubsystemStatus[] {
  const subsystems: SubsystemStatus[] = [];
  const info = result.info ?? {};
  const errors = result.error ?? {};

  const keys = ['database', 'redis', 'queues', 'schema'];
  for (const key of keys) {
    const detail = info[key] ?? errors[key];
    if (!detail) {
      subsystems.push({ name: key, status: 'down' });
      continue;
    }

    if (detail.mode === 'disabled') {
      subsystems.push({ name: key, status: 'disabled' });
      continue;
    }

    const nestedStatuses = getNestedStatuses(detail);
    if (nestedStatuses.includes('down')) {
      subsystems.push({ name: key, status: 'down' });
    } else if (nestedStatuses.includes('degraded')) {
      subsystems.push({ name: key, status: 'degraded' });
    } else if (detail.status === 'up') {
      subsystems.push({ name: key, status: 'up' });
    } else {
      subsystems.push({ name: key, status: 'down' });
    }
  }

  return subsystems;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly schemaReadiness: SchemaReadinessHealthIndicator,
    private readonly queues: QueueHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Liveness probe — is the process responsive?
   * No external dependency checks. Safe to poll at high frequency.
   */
  @Get('live')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 while the Node process is responsive. ' +
      'No external dependency checks. Use for Kubernetes liveness probes.',
  })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — are all dependencies available?
   * Returns 503 when any dependency is unavailable.
   * Includes per-subsystem diagnostics with actionable error messages.
   */
  @Get('ready')
  @HealthCheck()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks Postgres (latency, version, connections), Redis (latency, version), ' +
      'BullMQ queue workers, and confession-table schema. ' +
      'Returns 503 with per-subsystem diagnostics and actionable hints on failure. ' +
      'Use for Kubernetes readiness probes.',
  })
  @ApiResponse({ status: 200, description: 'All dependencies ready' })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies unavailable',
  })
  async readiness() {
    const result = await this.health.check([
      async () => this.db.isHealthy('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.queues.isHealthy('queues'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
    const jobsEnabled =
      this.configService?.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    return {
      ...result,
      backgroundJobMode: jobsEnabled ? 'enabled' : 'disabled',
      subsystems: buildSubsystemSummary(result),
    };
  }

  /** Backward-compatible alias for GET /health/ready. */
  @Get()
  @HealthCheck()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Health check (readiness alias)',
    description:
      'Backward-compatible alias for GET /health/ready. ' +
      'Prefer /health/ready for new integrations.',
  })
  @ApiResponse({ status: 200, description: 'All checks passed' })
  @ApiResponse({ status: 503, description: 'One or more checks failed' })
  async check() {
    const result = await this.health.check([
      async () => this.db.isHealthy('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.queues.isHealthy('queues'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
    const jobsEnabled =
      this.configService?.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    return {
      ...result,
      backgroundJobMode: jobsEnabled ? 'enabled' : 'disabled',
      subsystems: buildSubsystemSummary(result),
    };
  }
}
