import { OperationalMetricsService } from '../../observability/operational-metrics.service';

export const DEFAULT_FANOUT_CONCURRENCY = 10;
export const DEFAULT_FANOUT_MAX_QUEUE = 1000;

export interface FanoutQueueOptions {
  /** Max jobs running at once. */
  concurrency: number;
  /** Max jobs waiting in the queue. Beyond this, callers wait (overflow). */
  maxQueued: number;
  metrics?: Pick<
    OperationalMetricsService,
    'recordFanoutEvent' | 'recordFanoutQueueDelay' | 'setFanoutQueueDepth'
  >;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
}

export interface FanoutQueueSnapshot {
  active: number;
  queued: number;
  /** Callers currently suspended because the queue was full. */
  waitingForSpace: number;
  peakActive: number;
  peakQueued: number;
}

interface Job {
  start: () => void;
  enqueuedAt: number;
}

/**
 * Bounded, FIFO work queue that applies backpressure instead of dropping work.
 *
 * - At most `concurrency` jobs run at once, and at most `maxQueued` wait.
 * - When the queue is full the caller's promise simply stays pending
 *   (overflow). The only thing the queue holds for it is a small resume
 *   callback; the job itself lives in the caller's frame, so a burst slows
 *   producers down instead of growing fanout memory or losing notifications.
 * - Order is preserved: overflowed callers are admitted in arrival order as
 *   space frees up.
 * - A failing job rejects only its own promise; it never stalls the queue.
 */
export class BoundedFanoutQueue {
  private readonly concurrency: number;
  private readonly maxQueued: number;
  private readonly metrics?: FanoutQueueOptions['metrics'];
  private readonly now: () => number;

  private active = 0;
  private readonly queue: Job[] = [];
  private readonly overflow: Array<() => void> = [];
  private peakActive = 0;
  private peakQueued = 0;

  constructor(options: FanoutQueueOptions) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency));
    this.maxQueued = Math.max(1, Math.floor(options.maxQueued));
    this.metrics = options.metrics;
    this.now = options.now ?? Date.now;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    const enqueuedAt = this.now();

    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        enqueuedAt,
        start: () => {
          this.metrics?.recordFanoutQueueDelay(
            Math.max(this.now() - enqueuedAt, 0) / 1000,
          );
          this.active += 1;
          this.peakActive = Math.max(this.peakActive, this.active);
          this.publishDepth();
          void Promise.resolve()
            .then(task)
            .then(
              (value) => {
                this.metrics?.recordFanoutEvent('processed');
                resolve(value);
              },
              (error) => {
                this.metrics?.recordFanoutEvent('failed');
                reject(error);
              },
            )
            .finally(() => {
              this.active -= 1;
              this.pump();
            });
        },
      };

      this.metrics?.recordFanoutEvent('enqueued');

      // Fast path: free slot and nobody ahead of us.
      if (
        this.active < this.concurrency &&
        this.queue.length === 0 &&
        this.overflow.length === 0
      ) {
        job.start();
        return;
      }

      if (this.queue.length < this.maxQueued && this.overflow.length === 0) {
        this.enqueue(job);
        return;
      }

      // Queue full: defer the caller (never drop).
      this.metrics?.recordFanoutEvent('overflow');
      this.overflow.push(() => this.enqueue(job));
      this.publishDepth();
    });
  }

  snapshot(): FanoutQueueSnapshot {
    return {
      active: this.active,
      queued: this.queue.length,
      waitingForSpace: this.overflow.length,
      peakActive: this.peakActive,
      peakQueued: this.peakQueued,
    };
  }

  private enqueue(job: Job): void {
    this.queue.push(job);
    this.peakQueued = Math.max(this.peakQueued, this.queue.length);
    this.publishDepth();
    this.pump();
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      this.queue.shift()?.start();
    }
    // Space freed in the queue: admit deferred callers in arrival order.
    while (this.queue.length < this.maxQueued && this.overflow.length > 0) {
      const resume = this.overflow.shift();
      resume?.();
      // enqueue() pumps again, which may start more work.
    }
    this.publishDepth();
  }

  private publishDepth(): void {
    this.metrics?.setFanoutQueueDepth(this.queue.length + this.overflow.length);
  }
}
