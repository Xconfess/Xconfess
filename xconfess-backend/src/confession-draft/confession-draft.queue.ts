import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConfessionDraftService } from './confession-draft.service';

@Injectable()
export class ConfessionDraftQueue implements OnModuleDestroy {
  private readonly worker?: Worker;
  private readonly logger = new Logger(ConfessionDraftQueue.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly draftService: ConfessionDraftService,
    @InjectQueue('confession-draft-publisher')
    private readonly queue: Queue,
  ) {
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
        if (job.name === 'publish-due') {
          const ids = await this.draftService.enqueueDueDraftIds();

          await Promise.all(
            ids.map((id) =>
              this.queue.add(
                'publish-one',
                { id },
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

      this.logger.error(
        `ConfessionDraftQueue job failed: name=${job?.name} id=${job?.id} data=${JSON.stringify(job?.data ?? {})}`,
        trace,
      );
    });

    (async () => {
      try {
        await this.queue.add(
          'publish-due',
          {},
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