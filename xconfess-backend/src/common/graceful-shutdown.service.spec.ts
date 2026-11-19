import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { Worker } from 'bullmq';
import { AppLogger } from '../logger/logger.service';
import { GracefulShutdownService } from './graceful-shutdown.service';

describe('GracefulShutdownService worker drain', () => {
  let service: GracefulShutdownService;
  let queue: jest.Mocked<Pick<Queue, 'pause' | 'getActiveCount' | 'close'>>;
  let worker: jest.Mocked<Pick<Worker, 'pause' | 'close'>>;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'ENABLE_BACKGROUND_JOBS') return 'true';
        if (key === 'WORKER_DRAIN_TIMEOUT_MS') return 0;
        if (key === 'GRACEFUL_SHUTDOWN_TIMEOUT_MS') return 1000;
        return undefined;
      }),
    } as unknown as ConfigService;
    service = new GracefulShutdownService(config, new EventEmitter2(), {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    queue = {
      pause: jest.fn().mockResolvedValue(undefined),
      getActiveCount: jest.fn().mockResolvedValue(0),
      close: jest.fn().mockResolvedValue(undefined),
    };
    worker = {
      pause: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    service.registerQueue('notifications', queue as unknown as Queue);
    service.registerWorker(worker as unknown as Worker);
    warn = jest.spyOn((service as any).logger, 'warn').mockImplementation();
  });

  it('pauses consumption, waits for active jobs, then closes the queue', async () => {
    await (service as any).closeBullMQWorkers();

    expect(worker.pause).toHaveBeenCalledWith(true);
    expect(queue.pause).not.toHaveBeenCalled();
    expect(worker.pause.mock.invocationCallOrder[0]).toBeLessThan(
      queue.getActiveCount.mock.invocationCallOrder[0],
    );
    expect(queue.getActiveCount).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledWith(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('closes after the configured drain timeout and records remaining work', async () => {
    queue.getActiveCount.mockResolvedValue(2);

    await (service as any).closeBullMQWorkers();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('notifications=2'),
    );
    expect(queue.close).toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledWith(true);
  });
});
