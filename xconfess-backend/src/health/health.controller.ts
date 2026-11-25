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
import { DependencyState } from './dependency-check';

const DEPENDENCY_KEYS = ['database', 'redis', 'queues', 'schema'] as const;
type DependencyKey = (typeof DEPENDENCY_KEYS)[number];

export interface SubsystemStatus {
  name: DependencyKey;
  status: DependencyState;
}

type DetailMap = Record<string, Record<string, unknown> | undefined>;

/**
 * Read the standard `state` field (see dependency-check.ts). Falls back to the
 * Terminus `status` for indicators that do not set it, and treats a missing
 * entry as `down`.
 */
export function resolveDependencyState(
  detail: Record<string, unknown> | undefined,
  failed = false,
): DependencyState {
  if (!detail) return 'down';
  const state = detail.state;
  if (
    state === 'up' ||
    state === 'down' ||
    state === 'degraded' ||
    state === 'disabled'
  ) {
    return state;
  }
  if (failed) return 'down';
  return detail.status === 'up' ? 'up' : 'down';
}

function buildSubsystemSummary(result: {
  info?: DetailMap;
  error?: DetailMap;
  details?: DetailMap;
}): SubsystemStatus[] {
  const info = result.info ?? {};
  const errors = result.error ?? {};
  const details = result.details ?? {};

  return DEPENDENCY_KEYS.map((name) => {
    const failed = Boolean(errors[name]);
    const detail = errors[name] ?? info[name] ?? details[name];
    return { name, status: resolveDependencyState(detail, failed) };
  });
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
   * Deliberately touches no dependency (no indicator, no HealthCheckService),
   * so a database or Redis outage never restarts healthy pods.
   * Safe to poll at high frequency.
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
    return this.buildReadinessBody(await this.runDependencyChecks());
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
    return this.buildReadinessBody(await this.runDependencyChecks());
  }

  /**
   * Simplified health state classification.
   *
   * Returns a flat JSON object with an explicit `state` field that
   * classifies the system as one of:
   *
   *  • **live**       — the process is responsive (no dependency checks).
   *  • **ready**      — all dependencies are healthy.
   *  • **disabled**   — optional dependencies (Redis, queues) are intentionally
   *                     off (ENABLE_BACKGROUND_JOBS=false) but core deps are up.
   *  • **degraded**   — at least one critical dependency is down OR a queue is
   *                     unhealthy (high latency, no workers), but the system can
   *                     still serve partial traffic.
   *  • **down**       — a critical dependency (database, schema) is unreachable.
   *
   * Use this endpoint when you need a single, machine-readable state value
   * for dashboards, alerting, or load-balancer routing.
   */
  @Get('status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Health state classification',
    description:
      'Returns a flat JSON object with a `state` field: ' +
      'live | ready | disabled | degraded | down. ' +
      'Includes per-check detail for diagnostics.',
  })
  @ApiResponse({ status: 200, description: 'Health state returned' })
  async status() {
    const result = await this.runDependencyChecks().catch((err) => {
      // NestJS Terminus throws an HttpException whose .response body has:
      //   { status, error: { <failed> }, details: { <all> } }
      // We normalise both the success and failure shapes into a common
      // { details, errors } envelope so the state classifier below is simple.
      const body = err?.response ?? {};
      return {
        status: 'error' as const,
        details: body.details ?? {},
        errors: body.error ?? {},
      };
    });

    const details: DetailMap = result.details ?? {};
    const errors: DetailMap =
      result.status === 'error' ? ((result as any).errors ?? {}) : {};

    const states = Object.fromEntries(
      DEPENDENCY_KEYS.map((name) => {
        const detail = errors[name] ?? details[name];
        return [
          name,
          detail ? resolveDependencyState(detail, Boolean(errors[name])) : 'unknown',
        ];
      }),
    ) as Record<DependencyKey, DependencyState | 'unknown'>;

    let state: string;
    if (states.database === 'down' || states.schema === 'down') {
      // Critical dependency unavailable.
      state = 'down';
    } else if (
      states.redis === 'down' ||
      states.queues === 'down' ||
      states.redis === 'degraded' ||
      states.queues === 'degraded' ||
      states.database === 'degraded' ||
      states.schema === 'degraded'
    ) {
      state = 'degraded';
    } else if (states.redis === 'disabled' || states.queues === 'disabled') {
      // Optional deps intentionally off, core deps up.
      state = 'disabled';
    } else {
      state = 'ready';
    }

    const checkOf = (name: DependencyKey) => {
      const detail = errors[name] ?? details[name];
      return {
        status: states[name],
        ...(typeof detail?.errorCode === 'string'
          ? { errorCode: detail.errorCode }
          : {}),
      };
    };

    return {
      state,
      timestamp: new Date().toISOString(),
      checks: {
        database: checkOf('database'),
        redis: checkOf('redis'),
        queues: checkOf('queues'),
        schema: checkOf('schema'),
      },
    };
  }

  /**
   * Every dependency indicator bounds its own work with a timeout
   * (HEALTH_<DEPENDENCY>_TIMEOUT_MS / HEALTH_CHECK_TIMEOUT_MS), so readiness
   * always answers within that window even when a dependency hangs.
   */
  private runDependencyChecks(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => this.db.isHealthy('database'),
      async () => this.redis.isHealthy('redis'),
      async () => this.queues.isHealthy('queues'),
      async () => this.schemaReadiness.isHealthy('schema'),
    ]);
  }

  private buildReadinessBody(result: HealthCheckResult) {
    const jobsEnabled =
      this.configService?.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    return {
      ...result,
      backgroundJobMode: jobsEnabled ? 'enabled' : 'disabled',
      subsystems: buildSubsystemSummary(result),
    };
  }
}
