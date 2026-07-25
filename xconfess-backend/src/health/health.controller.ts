import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './redis.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { QueueHealthIndicator } from './queue.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
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
   */
  @Get('ready')
  @HealthCheck()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks Postgres, Redis, BullMQ queue workers, and confession-table schema. ' +
      'Returns 503 with per-check detail on failure. ' +
      'Use for Kubernetes readiness probes.',
  })
  @ApiResponse({ status: 200, description: 'All dependencies ready' })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies unavailable',
  })
  async readiness() {
    const result = await this.health.check([
      async () => this.db.pingCheck('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.queues.isHealthy('queues'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
    const jobsEnabled =
      this.configService?.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    return {
      ...result,
      backgroundJobMode: jobsEnabled ? 'enabled' : 'disabled',
    };
  }

  /** Backward-compatible alias for GET /health/ready. */
  @Get()
  @HealthCheck()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
      async () => this.db.pingCheck('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.queues.isHealthy('queues'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
    const jobsEnabled =
      this.configService?.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    return {
      ...result,
      backgroundJobMode: jobsEnabled ? 'enabled' : 'disabled',
    };
  }
}
