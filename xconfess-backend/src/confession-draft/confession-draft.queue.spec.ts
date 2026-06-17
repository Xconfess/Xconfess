import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import {
  CONFESSION_DRAFT_QUEUE,
  ConfessionDraftQueue,
} from './confession-draft.queue';
import { ConfessionDraftService } from './confession-draft.service';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('ConfessionDraftQueue', () => {
  let queue: jest.Mocked<Pick<Queue, 'add' | 'close'>>;
  let draftService: jest.Mocked<
    Pick<
      ConfessionDraftService,
      'enqueueDueDraftIds' | 'publishScheduledDraftById'
    >
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    draftService = {
      enqueueDueDraftIds: jest.fn().mockResolvedValue(['draft-1', 'draft-2']),
      publishScheduledDraftById: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('does not start a worker when background jobs are disabled', () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'ENABLE_BACKGROUND_JOBS' ? 'false' : fallback,
      ),
    } as unknown as ConfigService;

    new ConfessionDraftQueue(
      configService,
      draftService as unknown as ConfessionDraftService,
      queue as unknown as Queue,
    );

    expect(Worker).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('starts the publisher worker and schedules the recurring scan when jobs are enabled', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'ENABLE_BACKGROUND_JOBS') return 'true';
        if (key === 'REDIS_HOST') return 'redis.local';
        if (key === 'REDIS_PORT') return 6380;
        return fallback;
      }),
    } as unknown as ConfigService;

    new ConfessionDraftQueue(
      configService,
      draftService as unknown as ConfessionDraftService,
      queue as unknown as Queue,
    );
    await flushPromises();

    expect(Worker).toHaveBeenCalledWith(
      CONFESSION_DRAFT_QUEUE,
      expect.any(Function),
      { connection: { host: 'redis.local', port: 6380 } },
    );
    expect(queue.add).toHaveBeenCalledWith(
      'publish-due',
      {},
      {
        repeat: { pattern: '* * * * *' },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });

  it('enqueues due drafts and publishes individual draft jobs', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'ENABLE_BACKGROUND_JOBS' ? 'true' : fallback,
      ),
    } as unknown as ConfigService;

    new ConfessionDraftQueue(
      configService,
      draftService as unknown as ConfessionDraftService,
      queue as unknown as Queue,
    );

    const workerMock = Worker as unknown as jest.Mock;
    const processor = workerMock.mock.calls[0][1] as (job: {
      name: string;
      data?: Record<string, string>;
    }) => Promise<unknown>;

    queue.add.mockClear();
    await expect(processor({ name: 'publish-due' })).resolves.toEqual({
      enqueued: 2,
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'publish-one',
      { id: 'draft-1' },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await processor({ name: 'publish-one', data: { id: 'draft-2' } });

    expect(draftService.publishScheduledDraftById).toHaveBeenCalledWith(
      'draft-2',
    );
  });
});
