import type {
  WebhookEventClaim,
  WebhookEventRecord,
} from '../../src/moderation/moderation-webhook-event.store';

/**
 * In-memory stand-in for ModerationWebhookEventStore that mimics its
 * transactional behaviour: claims made inside a transaction become visible
 * only when the transaction body resolves, and are discarded when it throws.
 *
 * Wire a mocked `manager.transaction` through {@link runInTransaction}.
 */
export class FakeModerationWebhookEventStore {
  readonly committed = new Map<string, string>();
  private readonly staged = new WeakMap<object, WebhookEventRecord[]>();

  readonly find = jest.fn(async (eventId: string) => {
    const payloadHash = this.committed.get(eventId);
    return payloadHash ? { eventId, payloadHash } : null;
  });

  readonly claim = jest.fn(
    async (manager: object, record: WebhookEventRecord): Promise<WebhookEventClaim> => {
      const staged = this.staged.get(manager) ?? [];
      const existing =
        this.committed.get(record.eventId) ??
        staged.find((r) => r.eventId === record.eventId)?.payloadHash;
      if (existing) {
        return existing === record.payloadHash ? 'duplicate' : 'conflict';
      }
      staged.push(record);
      this.staged.set(manager, staged);
      return 'claimed';
    },
  );

  readonly pruneOlderThan = jest.fn(async () => 0);

  async runInTransaction<T>(
    manager: object,
    work: (manager: any) => Promise<T>,
  ): Promise<T> {
    try {
      const value = await work(manager);
      for (const record of this.staged.get(manager) ?? []) {
        this.committed.set(record.eventId, record.payloadHash);
      }
      return value;
    } finally {
      this.staged.delete(manager);
    }
  }
}
