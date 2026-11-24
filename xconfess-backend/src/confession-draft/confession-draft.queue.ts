import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConfessionDraftService } from './confession-draft.service';
import { GracefulShutdownService } from '../common/graceful-shutdown.service';
import {
  correlationLogTag,
  readCorrelationId,
  withCorrelationId,
} from '../common/correlation-id';

@Injectable()
export class ConfessionDraftQueue implements OnModuleDestroy {
  private readonly worker?: Worker;
  private readonly logger = new Logger(ConfessionDraftQueue.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly draftService: ConfessionDraftService,
    private readonly gracefulShutdown: GracefulShutdownService,
    @InjectQueue('confession-draft-publisher')
    private readonly queue: Queue,
  ) {
    this.gracefulShutdown.registerQueue('confession-draft-publisher', queue);

    if (this.configService.get<string>('ENABLE_BACKGROUND_JOBS') !== 'true') {
      this.logger.log(
        'Confession draft publisher is disabled; set ENABLE_BACKGROUND_JOBS=true to enable it.',
      );
      return;
    }

    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    };

    this.worker = new Worker(
      'confession-draft-publisher',
      async (job: Job) => {
        // Issue #2126: every job log carries the correlation id so a
        // failure that surfaces after the originating request has
        // returned is still traceable to it. The parent `publish-due`
        // job propagates its id to the `publish-one` children it
        // enqueues.
        const parentCorrelationId = readCorrelationId(job.data);
        this.logger.log(
          `ConfessionDraftQueue job starting name=${job.name} id=${job.id}${correlationLogTag(job.data)}`,
        );

        if (job.name === 'publish-due') {
          const ids = await this.draftService.enqueueDueDraftIds();

          await Promise.all(
            ids.map((id) =>
              this.queue.add(
                'publish-one',
                // Carry the parent correlation id into each child so
                // a `publish-one` worker log and the originating
                // `publish-due` log share the same id. New children
                // get a fresh UUID when the parent did not have one.
                withCorrelationId({ id }, parentCorrelationId),
                {
                  attempts: 5,
                  backoff: { type: 'exponential', delay: 1000 },
                  removeOnComplete: true,
                  removeOnFail: false,
                },
              ),
            ),
          );

          return { enqueued: ids.length };
        }

        if (job.name === 'publish-one') {
          const id = job.data?.id as string;

          if (!id) {
            return;
          }

          await this.draftService.publishScheduledDraftById(id);
          return;
        }
      },
      { connection: redisConfig },
    );

    this.worker.on('error', (err) => {
      const trace = err instanceof Error ? err.stack : String(err);
      this.logger.error('ConfessionDraftQueue worker error', trace);
    });

    this.worker.on('failed', (job, err) => {
      const trace = err instanceof Error ? err.stack : String(err);

      // Issue #2126: the correlation id is the first piece of context
      // on every failure line so an on-call engineer can grep one id
      // through enqueue, processing and failure logs.
      this.logger.error(
        `ConfessionDraftQueue job failed:${correlationLogTag(job?.data)} name=${job?.name} id=${job?.id} data=${JSON.stringify(job?.data ?? {})}`,
        trace,
      );
    });

    (async () => {
      try {
        await this.queue.add(
          'publish-due',
          // Issue #2126: the scheduler-born parent job also carries a
          // correlation id so its children inherit it. A fresh UUID
          // per repeat window is good enough - there is no upstream
          // request to tie this to.
          withCorrelationId({}),
          {
            repeat: { pattern: '* * * * *' },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
      } catch (err) {
        const trace = err instanceof Error ? err.stack : String(err);

        this.logger.error(
          'Failed to schedule publish-due recurring job',
          trace,
        );
      }
    })();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }
}