import { AttachmentDeletionWorker } from './attachment-deletion.worker';
import { ObjectNotFoundError } from './attachment-storage';
import { AttachmentStatus } from './entities/attachment.entity';

interface Row {
  id: string;
  objectKey: string;
  status: AttachmentStatus;
  confessionId: string | null;
  messageId: number | null;
  updatedAt: number;
}

/** In-memory stand-in that mirrors the repository's conditional-write semantics. */
class FakeRepo {
  rows = new Map<string, Row>();
  /** Hook run between claim and final delete, to simulate races. */
  afterClaim?: (id: string) => void;

  add(row: Partial<Row> & { id: string }): Row {
    const full: Row = {
      objectKey: `key-${row.id}`,
      status: AttachmentStatus.ABANDONED,
      confessionId: null,
      messageId: null,
      updatedAt: this.rows.size,
      ...row,
    };
    this.rows.set(full.id, full);
    return full;
  }

  findById = jest.fn(async (id: string) => this.rows.get(id) ?? null);

  claimUnreferencedForDeletion = jest.fn(async (id: string) => {
    const row = this.rows.get(id);
    if (!row || row.confessionId || row.messageId !== null) return false;
    row.status = AttachmentStatus.ABANDONED;
    return true;
  });

  countOtherLiveRowsForObjectKey = jest.fn(
    async (objectKey: string, excludeId: string) =>
      [...this.rows.values()].filter(
        (r) =>
          r.objectKey === objectKey &&
          r.id !== excludeId &&
          r.status !== AttachmentStatus.ABANDONED,
      ).length,
  );

  deleteClaimedIfUnreferenced = jest.fn(async (id: string) => {
    this.afterClaim?.(id);
    const row = this.rows.get(id);
    if (
      !row ||
      row.status !== AttachmentStatus.ABANDONED ||
      row.confessionId ||
      row.messageId !== null
    ) {
      return 0;
    }
    this.rows.delete(id);
    return 1;
  });

  isReferenced = jest.fn(async (id: string) => {
    const row = this.rows.get(id);
    return !!(row?.confessionId || row?.messageId);
  });

  findAbandonedForDeletion = jest.fn(async (limit: number) =>
    [...this.rows.values()]
      .filter((r) => r.status === AttachmentStatus.ABANDONED)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, limit),
  );
}

function makeWorker(config: Record<string, unknown> = {}) {
  const repo = new FakeRepo();
  const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
  const worker = new AttachmentDeletionWorker(repo as any, storage, {
    get: jest.fn((key: string) => config[key]),
  } as any);
  const sleeps: number[] = [];
  worker.sleep = async (ms) => {
    sleeps.push(ms);
  };
  return { repo, storage, worker, sleeps };
}

describe('AttachmentDeletionWorker (#2394)', () => {
  describe('idempotency', () => {
    it('deletes the object then the row', async () => {
      const { repo, storage, worker } = makeWorker();
      repo.add({ id: 'a1', objectKey: 'obj-a1' });

      await expect(worker.deleteWithRetry('a1')).resolves.toEqual({
        attachmentId: 'a1',
        outcome: 'deleted',
        attempts: 1,
      });
      expect(storage.deleteObject).toHaveBeenCalledWith('obj-a1');
      expect(repo.rows.has('a1')).toBe(false);
    });

    it('treats an already-removed object (ObjectNotFoundError) as success', async () => {
      const { repo, storage, worker } = makeWorker();
      repo.add({ id: 'a1' });
      storage.deleteObject.mockRejectedValue(new ObjectNotFoundError());

      const result = await worker.deleteWithRetry('a1');

      expect(result.outcome).toBe('deleted');
      expect(result.attempts).toBe(1);
      expect(repo.rows.has('a1')).toBe(false);
    });

    it('treats an already-removed row as success without touching storage', async () => {
      const { storage, worker } = makeWorker();

      const result = await worker.deleteWithRetry('missing');

      expect(result).toMatchObject({ outcome: 'already_deleted', attempts: 1 });
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('is safe to run twice for the same attachment', async () => {
      const { repo, worker } = makeWorker();
      repo.add({ id: 'a1' });

      expect((await worker.deleteWithRetry('a1')).outcome).toBe('deleted');
      expect((await worker.deleteWithRetry('a1')).outcome).toBe(
        'already_deleted',
      );
    });
  });

  describe('reference checks before storage deletion', () => {
    it.each([
      ['confession', { confessionId: 'c1' }],
      ['message', { messageId: 7 }],
    ])(
      'never deletes storage for an attachment still referenced by a %s',
      async (_n, refs) => {
        const { repo, storage, worker } = makeWorker();
        repo.add({ id: 'a1', ...refs });

        const result = await worker.deleteWithRetry('a1');

        expect(result.outcome).toBe('skipped_referenced');
        expect(storage.deleteObject).not.toHaveBeenCalled();
        expect(repo.rows.has('a1')).toBe(true);
      },
    );

    it('keeps the object when another live row shares the same objectKey', async () => {
      const { repo, storage, worker } = makeWorker();
      repo.add({ id: 'a1', objectKey: 'shared' });
      repo.add({
        id: 'a2',
        objectKey: 'shared',
        status: AttachmentStatus.COMPLETED,
        confessionId: 'c1',
      });

      const result = await worker.deleteWithRetry('a1');

      expect(result.outcome).toBe('deleted');
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(repo.rows.has('a1')).toBe(false);
      expect(repo.rows.has('a2')).toBe(true);
    });
  });

  describe('race scenarios', () => {
    it('does not remove a row that becomes referenced after the claim', async () => {
      const { repo, worker } = makeWorker();
      repo.add({ id: 'a1' });
      repo.afterClaim = (id) => {
        repo.rows.get(id)!.confessionId = 'c-late';
      };

      const result = await worker.deleteWithRetry('a1');

      expect(result.outcome).toBe('skipped_referenced');
      expect(repo.rows.has('a1')).toBe(true);
    });

    it('reports success when a concurrent worker already finished the row', async () => {
      const { repo, worker } = makeWorker();
      repo.add({ id: 'a1' });
      repo.afterClaim = (id) => {
        repo.rows.delete(id);
      };

      const result = await worker.deleteWithRetry('a1');

      expect(result.outcome).toBe('deleted');
      expect(result.attempts).toBe(1);
    });

    it('two workers racing on the same attachment both finish without error', async () => {
      const a = makeWorker();
      const b = new AttachmentDeletionWorker(a.repo as any, a.storage, {
        get: jest.fn(),
      } as any);
      b.sleep = async () => undefined;
      a.repo.add({ id: 'a1' });

      const [r1, r2] = await Promise.all([
        a.worker.deleteWithRetry('a1'),
        b.deleteWithRetry('a1'),
      ]);

      expect(['deleted', 'already_deleted']).toContain(r1.outcome);
      expect(['deleted', 'already_deleted']).toContain(r2.outcome);
      expect(a.repo.rows.has('a1')).toBe(false);
    });
  });

  describe('retry with bounded backoff', () => {
    it('retries a transient storage failure and then succeeds', async () => {
      const { repo, storage, worker, sleeps } = makeWorker();
      repo.add({ id: 'a1' });
      storage.deleteObject
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue(undefined);

      const result = await worker.deleteWithRetry('a1');

      expect(result).toMatchObject({ outcome: 'deleted', attempts: 3 });
      expect(sleeps).toEqual([500, 1000]);
      expect(repo.rows.has('a1')).toBe(false);
    });

    it('gives up after maxAttempts, keeps the row for the next sweep, and never leaks the key', async () => {
      const { repo, storage, worker, sleeps } = makeWorker({
        ATTACHMENT_DELETION_MAX_ATTEMPTS: 4,
      });
      repo.add({ id: 'a1', objectKey: 'secret-object-key' });
      storage.deleteObject.mockRejectedValue(
        new Error('bucket secret-object-key unavailable'),
      );

      const result = await worker.deleteWithRetry('a1');

      expect(result).toMatchObject({ outcome: 'failed', attempts: 4 });
      expect(JSON.stringify(result)).not.toContain('secret-object-key');
      expect(storage.deleteObject).toHaveBeenCalledTimes(4);
      expect(sleeps).toHaveLength(3); // no sleep after the final attempt
      // Row survives as ABANDONED so the object can't be orphaned.
      expect(repo.rows.get('a1')?.status).toBe(AttachmentStatus.ABANDONED);
    });

    it('caps backoff at the configured maximum', () => {
      const { worker } = makeWorker({
        ATTACHMENT_DELETION_BASE_DELAY_MS: 1000,
        ATTACHMENT_DELETION_MAX_DELAY_MS: 5000,
      });
      expect(
        [1, 2, 3, 4, 5, 10, 50].map((n) => worker.backoffDelayMs(n)),
      ).toEqual([1000, 2000, 4000, 5000, 5000, 5000, 5000]);
    });

    it('recovers a partial failure (storage deleted, row delete failed) on retry', async () => {
      const { repo, storage, worker } = makeWorker();
      repo.add({ id: 'a1' });
      const realDelete =
        repo.deleteClaimedIfUnreferenced.getMockImplementation()!;
      repo.deleteClaimedIfUnreferenced.mockRejectedValueOnce(
        new Error('connection reset'),
      );
      repo.deleteClaimedIfUnreferenced.mockImplementation(realDelete);
      // Second attempt: object is already gone.
      storage.deleteObject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ObjectNotFoundError());

      const result = await worker.deleteWithRetry('a1');

      expect(result).toMatchObject({ outcome: 'deleted', attempts: 2 });
      expect(repo.rows.has('a1')).toBe(false);
    });
  });

  describe('restart safety (sweep)', () => {
    it('finishes interrupted work and reports per-outcome counts', async () => {
      const { repo, storage, worker } = makeWorker({
        ATTACHMENT_DELETION_MAX_ATTEMPTS: 2,
      });
      repo.add({ id: 'ok' });
      repo.add({ id: 'bad', objectKey: 'bad-key' });
      storage.deleteObject.mockImplementation(async (key: string) => {
        if (key === 'bad-key') throw new Error('boom');
      });

      const first = await worker.processPending();
      expect(first).toEqual({
        scanned: 2,
        deleted: 1,
        alreadyDeleted: 0,
        skippedReferenced: 0,
        failed: 1,
      });
      expect([...repo.rows.keys()]).toEqual(['bad']);

      // "Restart": a fresh worker over the same database finishes the job.
      storage.deleteObject.mockResolvedValue(undefined);
      const restarted = new AttachmentDeletionWorker(repo as any, storage, {
        get: jest.fn(),
      } as any);
      restarted.sleep = async () => undefined;
      const second = await restarted.processPending();

      expect(second).toMatchObject({ scanned: 1, deleted: 1, failed: 0 });
      expect(repo.rows.size).toBe(0);
    });

    it('scheduledSweep does not overlap itself and swallows errors', async () => {
      const { repo, worker } = makeWorker();
      let release!: () => void;
      repo.findAbandonedForDeletion.mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve([]))),
      );

      const first = worker.scheduledSweep();
      await worker.scheduledSweep(); // returns immediately: sweep in progress
      expect(repo.findAbandonedForDeletion).toHaveBeenCalledTimes(1);
      release();
      await first;

      repo.findAbandonedForDeletion.mockRejectedValueOnce(new Error('db down'));
      await expect(worker.scheduledSweep()).resolves.toBeUndefined();
    });
  });
});
