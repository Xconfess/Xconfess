import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConfessionDraftService } from './confession-draft.service';

export const CONFESSION_DRAFT_QUEUE = 'confession-draft-publisher';

interface DraftPublishJobData {
  id?: string;
}

@Injectable()
export class ConfessionDraftQueue implements OnModuleDestroy {
  private readonly worker?: Worker<DraftPublishJobData>;
  private readonly logger = new Logger(ConfessionDraftQueue.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly draftService: ConfessionDraftService,
    @InjectQueue(CONFESSION_DRAFT_QUEUE)
    private readonly queue: Queue,
  ) {
    const jobsEnabled =
      this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';

    if (!jobsEnabled) {
      this.logger.log(
        'Confession draft publisher disabled because ENABLE_BACKGROUND_JOBS is not "true"',
      );
      return;
    }

    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    };

    this.worker = new Worker<DraftPublishJobData>(
      CONFESSION_DRAFT_QUEUE,
      async (job: Job<DraftPublishJobData>) => {
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
          const id = job.data.id;
          if (!id) return;
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

    void (async () => {
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
