import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  buildDependencyDetail,
  classifyDependencyError,
  DependencyErrorCode,
  DependencyState,
  resolveBackgroundJobsDisabledReason,
  resolveDependencyTimeoutMs,
  summarizeDependencyError,
  withDependencyTimeout,
} from './dependency-check';

export interface QueueDetail {
  status: 'up' | 'down' | 'degraded';
  workers?: number;
  counts?: Record<string, number>;
  latencyMs?: number;
  errorCode?: DependencyErrorCode;
  error?: string;
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
    const timeoutMs = resolveDependencyTimeoutMs(this.configService, 'queues');
    const rawConfig = this.configService.get<string | undefined>(
      'ENABLE_BACKGROUND_JOBS',
    );

    if (rawConfig !== 'true') {
      return {
        [key]: buildDependencyDetail({
          dependency: 'queues',
          state: 'disabled',
          timeoutMs,
          message: 'Queue check skipped because background jobs are disabled',
          details: {
            reason: resolveBackgroundJobsDisabledReason(rawConfig),
            severity: 'info',
          },
        }),
      };
    }

    const queues: Array<{
      name: string;
      queue: Queue;
      requiresWorkers: boolean;
    }> = [
      { name: 'notifications', queue: this.notifications, requiresWorkers: true },
      { name: 'notifications-dlq', queue: this.dlq, requiresWorkers: false },
      { name: 'export-queue', queue: this.exportQueue, requiresWorkers: true },
      {
        name: 'confession-draft-publisher',
        queue: this.draftQueue,
        requiresWorkers: true,
      },
    ];

    const latencyThreshold =
      Number(this.configService.get<number>('REDIS_QUEUE_LATENCY_THRESHOLD_MS')) ||
      250;

    const started = Date.now();
    const perQueue: Record<string, QueueDetail> = {};

    const probe = async (
      queue: Queue,
      requiresWorkers: boolean,
    ): Promise<QueueDetail> => {
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

      return {
        status: hasWorkers ? (isDegraded ? 'degraded' : 'up') : 'down',
        workers: workerCount,
        counts,
        latencyMs,
      };
    };

    const markFailed = (name: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Queue health check failed for "${name}": ${message}`);
      const errorCode = classifyDependencyError(error);
      perQueue[name] = {
        status: 'down',
        errorCode,
        // Fixed summary only; the raw driver message stays in the logs.
        error: summarizeDependencyError(errorCode),
      };
    };

    try {
      // One timeout bounds the whole check, however many queues there are.
      await withDependencyTimeout('queues', timeoutMs, async () => {
        for (const { name, queue, requiresWorkers } of queues) {
          try {
            perQueue[name] = await probe(queue, requiresWorkers);
          } catch (error: unknown) {
            markFailed(name, error);
          }
        }
      });
    } catch (error: unknown) {
      // Timed out: every queue that has not answered yet is reported down.
      for (const { name } of queues) {
        if (!perQueue[name]) markFailed(name, error);
      }
    }

    const statuses = Object.values(perQueue).map((detail) => detail.status);

    let state: DependencyState = 'up';
    if (statuses.includes('down')) state = 'down';
    else if (statuses.includes('degraded')) state = 'degraded';

    if (state === 'up') {
      return {
        [key]: buildDependencyDetail({
          dependency: 'queues',
          state,
          timeoutMs,
          latencyMs: Date.now() - started,
          message: 'All monitored queues are healthy',
          details: { queues: perQueue },
        }),
      };
    }

    const unhealthy = Object.entries(perQueue)
      .filter(([, detail]) => detail.status !== 'up')
      .map(([name]) => name);
    const timedOut = Object.values(perQueue).some(
      (detail) => detail.errorCode === 'TIMEOUT',
    );

    // Degraded or down queues keep failing readiness (existing behaviour);
    // the `state` field tells operators which of the two it is.
    throw new HealthCheckError('One or more queues are unhealthy', {
      [key]: buildDependencyDetail({
        dependency: 'queues',
        state,
        timeoutMs,
        latencyMs: Date.now() - started,
        message: `Unhealthy queues: ${unhealthy.join(', ')}`,
        errorCode: timedOut ? 'TIMEOUT' : 'UNHEALTHY',
        failsReadiness: true,
        hint:
          state === 'degraded'
            ? 'Queue Redis latency exceeds REDIS_QUEUE_LATENCY_THRESHOLD_MS. Check Redis load and network latency.'
            : 'Start the worker processes for the listed queues and verify Redis connectivity (REDIS_HOST / REDIS_PORT).',
        details: { queues: perQueue },
      }),
    });
  }
}
