import { BoundedFanoutQueue } from './notification-fanout-queue';
import { OperationalMetricsService } from '../../observability/operational-metrics.service';

/** A job whose completion the test controls. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

describe('BoundedFanoutQueue (#2393)', () => {
  it('never runs more than `concurrency` jobs and never queues more than `maxQueued`', async () => {
    const queue = new BoundedFanoutQueue({ concurrency: 3, maxQueued: 5 });
    let running = 0;
    let maxRunning = 0;
    const gates = Array.from({ length: 40 }, () => deferred());

    const results = gates.map((gate, i) =>
      queue.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gate.promise;
        running -= 1;
        return i;
      }),
    );

    await tick();
    expect(queue.snapshot()).toMatchObject({
      active: 3,
      queued: 5,
      waitingForSpace: 32,
    });

    for (const gate of gates) {
      gate.resolve();
      await tick();
    }

    await expect(Promise.all(results)).resolves.toEqual(
      Array.from({ length: 40 }, (_, i) => i),
    );
    expect(maxRunning).toBe(3);
    const snap = queue.snapshot();
    expect(snap.peakActive).toBe(3);
    expect(snap.peakQueued).toBeLessThanOrEqual(5);
    expect(snap).toMatchObject({ active: 0, queued: 0, waitingForSpace: 0 });
  });

  it('does not drop work: a 2,000-job burst is fully processed in arrival order', async () => {
    const queue = new BoundedFanoutQueue({ concurrency: 4, maxQueued: 10 });
    const order: number[] = [];

    await Promise.all(
      Array.from({ length: 2000 }, (_, i) =>
        queue.run(async () => {
          await tick();
          order.push(i);
        }),
      ),
    );

    expect(order).toHaveLength(2000);
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 2000 }, (_, i) => i),
    );
    // Single-slot ordering guarantee: start order equals arrival order.
    const startOrder: number[] = [];
    const q2 = new BoundedFanoutQueue({ concurrency: 1, maxQueued: 2 });
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        q2.run(async () => {
          startOrder.push(i);
        }),
      ),
    );
    expect(startOrder).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('recovers after a burst: depth returns to zero and new work starts immediately', async () => {
    let clock = 0;
    const metrics = new OperationalMetricsService();
    const queue = new BoundedFanoutQueue({
      concurrency: 2,
      maxQueued: 3,
      metrics,
      now: () => clock,
    });

    const gates = Array.from({ length: 12 }, () => deferred());
    const burst = gates.map((g) => queue.run(() => g.promise));
    await tick();
    expect(queue.snapshot().waitingForSpace).toBeGreaterThan(0);

    clock = 2000; // queued work waited 2s
    for (const g of gates) {
      g.resolve();
      await tick();
    }
    await Promise.all(burst);

    expect(queue.snapshot()).toMatchObject({
      active: 0,
      queued: 0,
      waitingForSpace: 0,
    });
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_notification_fanout_queue_depth 0',
    );

    // Recovery: a fresh job is not delayed by the earlier burst.
    clock = 5000;
    await queue.run(async () => 'ok');
    const text = metrics.renderPrometheus();
    expect(text).toContain(
      'xconfess_notification_fanout_queue_delay_seconds_count 13',
    );
    expect(text).toContain(
      'xconfess_notification_fanout_total{event="processed"} 13',
    );
  });

  it('records overflow, enqueue and queue-delay metrics', async () => {
    let clock = 0;
    const metrics = new OperationalMetricsService();
    const queue = new BoundedFanoutQueue({
      concurrency: 1,
      maxQueued: 1,
      metrics,
      now: () => clock,
    });
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((g) => queue.run(() => g.promise));
    await tick();

    clock = 3000;
    gates.forEach((g) => g.resolve());
    await Promise.all(runs);

    const text = metrics.renderPrometheus();
    expect(text).toContain(
      'xconfess_notification_fanout_total{event="enqueued"} 3',
    );
    expect(text).toContain(
      'xconfess_notification_fanout_total{event="overflow"} 1',
    );
    // Two jobs waited 3s, one started instantly: sum is 6s.
    expect(text).toContain(
      'xconfess_notification_fanout_queue_delay_seconds_sum 6',
    );
  });

  it('isolates failures: a rejecting job does not stall or drop others', async () => {
    const metrics = new OperationalMetricsService();
    const queue = new BoundedFanoutQueue({
      concurrency: 1,
      maxQueued: 2,
      metrics,
    });
    const boom = new Error('socket gone');

    const results = await Promise.allSettled([
      queue.run(async () => 'a'),
      queue.run(async () => {
        throw boom;
      }),
      queue.run(async () => 'c'),
      queue.run(async () => 'd'),
    ]);

    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
    expect((results[1] as PromiseRejectedResult).reason).toBe(boom);
    expect(queue.snapshot().active).toBe(0);
    expect(metrics.renderPrometheus()).toContain(
      'xconfess_notification_fanout_total{event="failed"} 1',
    );
  });

  it('survives a synchronous throw inside a task', async () => {
    const queue = new BoundedFanoutQueue({ concurrency: 1, maxQueued: 1 });
    await expect(
      queue.run(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
    await expect(queue.run(async () => 1)).resolves.toBe(1);
  });
});
