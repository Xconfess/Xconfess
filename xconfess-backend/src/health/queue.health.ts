import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

interface QueueDetail {
  status: 'up' | 'down' | 'degraded';
  workers?: number;
  counts?: Record<string, number>;
  error?: string;
  latencyMs?: number;
}

/**
 * Resolves a human-readable reason for why background jobs are disabled
 * based on the raw config value of ENABLE_BACKGROUND_JOBS.
 *
 * Distinguishes three cases so operators can tell at a glance whether the
 * disabled state is intentional or a misconfiguration:
 *
 * - `"false"` → intentionally disabled (e.g. local development)
 * - `undefined` → not set at all (defaults to disabled)
 * - any other value → misconfiguration (expected `"true"`)
 */
function resolveDisabledReason(rawValue: unknown): string {
  if (rawValue === 'false') {
    return 'ENABLE_BACKGROUND_JOBS is set to "false" (background jobs intentionally disabled)';
  }

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 'ENABLE_BACKGROUND_JOBS is not set (defaults to disabled)';
  }

  return `ENABLE_BACKGROUND_JOBS is set to "${String(rawValue)}" (expected "true" to enable)`;
}

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(QueueHealthIndicator.name);

  constructor(
    @InjectQueue('notifications') private readonly notifications: Queue,
    @InjectQueue('notifications-dlq') private readonly dlq: Queue,
    @InjectQueue('export-queue') private readonly exportQueue: Queue,
    @InjectQueue('confession-draft-publisher')
    private readonly draftQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const rawConfig = this.configService.get<string | undefined>(
      'ENABLE_BACKGROUND_JOBS',
    );
    const jobsEnabled = rawConfig === 'true';

    if (!jobsEnabled) {
      return this.getStatus(key, true, {
        mode: 'disabled',
        reason: resolveDisabledReason(rawConfig),
        severity: 'info',
      });
    }

    const queues: Array<{
      name: string;
      queue: Queue;
      requiresWorkers: boolean;
    }> = [
      {
        name: 'notifications',
        queue: this.notifications,
        requiresWorkers: true,
      },
      {
        name: 'notifications-dlq',
        queue: this.dlq,
        requiresWorkers: false,
      },
      {
        name: 'export-queue',
        queue: this.exportQueue,
        requiresWorkers: true,
      },
      {
        name: 'confession-draft-publisher',
        queue: this.draftQueue,
        requiresWorkers: true,
      },
    ];

    const latencyThreshold =
      this.configService.get<number>('REDIS_QUEUE_LATENCY_THRESHOLD_MS') || 250;

    const details: Record<string, QueueDetail> = {};
    let allHealthy = true;

    for (const { name, queue, requiresWorkers } of queues) {
      try {
        const [counts, workers, client] = await Promise.all([
          queue.getJobCounts('active', 'waiting', 'failed', 'delayed'),
          queue.getWorkers(),
          queue.client,
        ]);

        const start = Date.now();
        await (client as unknown as { ping: () => Promise<string> }).ping();
        const latencyMs = Date.now() - start;

        const workerCount = workers.length;
        const hasWorkers = !requiresWorkers || workerCount > 0;
        const isDegraded = latencyMs >= latencyThreshold;
        const healthy = hasWorkers && !isDegraded;

        if (!healthy) {
          allHealthy = false;
        }

        details[name] = {
          status: hasWorkers ? (isDegraded ? 'degraded' : 'up') : 'down',
          workers: workerCount,
          counts,
          latencyMs,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Queue health check failed for "${name}": ${message}`,
        );
        allHealthy = false;
        details[name] = { status: 'down', error: message };
      }
    }

    if (!allHealthy) {
      throw new HealthCheckError(
        'One or more queues are unhealthy',
        this.getStatus(key, false, details),
      );
    }

    return this.getStatus(key, true, details);
  }
}
