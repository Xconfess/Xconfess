import { DataSource } from 'typeorm';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { ModerationStatus } from '../moderation/ai-moderation.service';
import { ModerationLog } from '../moderation/entities/moderation-log.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

type Row = Record<string, any>;

/**
 * In-memory stand-in for Postgres transaction semantics (#2166). A transaction
 * works on the live tables. If the callback throws, the tables are restored to
 * the snapshot taken when the transaction began, the same effect as ROLLBACK.
 * The real services run unmodified against this store.
 */
class RollbackStore {
  private tables: Record<string, Row[]> = {};
  private nextId = 1;

  seed(table: string, rows: Row[]): void {
    this.tables[table] = structuredClone(rows);
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  insert(table: string, row: Row): Row {
    const stored = { ...structuredClone(row), id: row.id ?? this.nextId++ };
    this.tables[table] = [...this.rows(table), stored];
    return structuredClone(stored);
  }

  update(table: string, row: Row): Row {
    this.tables[table] = this.rows(table).map((existing) =>
      existing.id === row.id ? structuredClone(row) : existing,
    );
    return structuredClone(row);
  }

  async transaction<T>(work: (manager: FakeManager) => Promise<T>): Promise<T> {
    const snapshot = {
      tables: structuredClone(this.tables),
      nextId: this.nextId,
    };

    try {
      return await work(new FakeManager(this));
    } catch (error) {
      this.tables = snapshot.tables;
      this.nextId = snapshot.nextId;
      throw error;
    }
  }
}

class FakeRepo {
  constructor(
    private readonly store: RollbackStore,
    private readonly table: string,
  ) {}

  create(data: Row): Row {
    return { ...data };
  }

  async findOne({ where }: { where: Row }): Promise<Row | null> {
    const match = this.store
      .rows(this.table)
      .find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
    return match ? structuredClone(match) : null;
  }

  async save(entity: Row): Promise<Row> {
    return entity.id === undefined
      ? this.store.insert(this.table, entity)
      : this.store.update(this.table, entity);
  }
}

class FakeManager {
  constructor(private readonly store: RollbackStore) {}

  getRepository(entity: { name: string }): FakeRepo {
    return new FakeRepo(this.store, entity.name);
  }
}

const MODERATION_LOG = ModerationLog.name;

describe('transaction rollback (#2166)', () => {
  let store: RollbackStore;
  let service: ModerationRepositoryService;
  let auditLogService: { logModerationStateTransition: jest.Mock };

  const actor = { id: '7', email: 'admin@example.com' };

  beforeEach(() => {
    store = new RollbackStore();
    auditLogService = {
      logModerationStateTransition: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: (work: (manager: FakeManager) => Promise<unknown>) =>
        store.transaction(work),
    } as unknown as DataSource;

    service = new ModerationRepositoryService(
      {} as any,
      dataSource,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('moderation state transition (transitionState)', () => {
    beforeEach(() => {
      store.seed(MODERATION_LOG, [
        {
          id: 'log-1',
          confessionId: 'confession-1',
          moderationStatus: ModerationStatus.PENDING,
          reviewed: false,
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
        },
      ]);
    });

    it('commits the status change when every step succeeds', async () => {
      await service.transitionState(
        'log-1',
        ModerationStatus.APPROVED,
        actor,
        'looks fine',
      );

      expect(store.rows(MODERATION_LOG)[0]).toMatchObject({
        moderationStatus: ModerationStatus.APPROVED,
        reviewed: true,
        reviewedBy: actor.id,
      });
    });

    // AuditLogService.log() swallows its own write errors, so this models a
    // later step that does throw. The state change must not survive it.
    it('restores the previous status when a step after the state change throws', async () => {
      auditLogService.logModerationStateTransition.mockRejectedValueOnce(
        new Error('audit write failed'),
      );

      await expect(
        service.transitionState(
          'log-1',
          ModerationStatus.APPROVED,
          actor,
          'looks fine',
        ),
      ).rejects.toThrow('audit write failed');

      expect(store.rows(MODERATION_LOG)[0]).toMatchObject({
        moderationStatus: ModerationStatus.PENDING,
        reviewed: false,
        reviewedBy: null,
      });
    });

    it('leaves the store untouched when the transition is invalid', async () => {
      await expect(
        service.transitionState(
          'log-1',
          ModerationStatus.RESOLVED,
          actor,
          'skipping review',
        ),
      ).rejects.toThrow();

      expect(store.rows(MODERATION_LOG)[0]).toMatchObject({
        moderationStatus: ModerationStatus.PENDING,
        reviewed: false,
      });
      expect(
        auditLogService.logModerationStateTransition,
      ).not.toHaveBeenCalled();
    });
  });

  describe('moderation webhook result sync (syncWebhookResult)', () => {
    const result = {
      score: 0.91,
      flags: ['harassment'],
      status: ModerationStatus.REJECTED,
      details: {},
      requiresReview: true,
    } as any;

    const delivery = {
      confessionId: 'confession-2',
      content: 'delivered text',
      result,
      deliveryHash: 'hash-1',
      deliveryTimestamp: '2026-01-01T00:00:00Z',
    };

    it('discards the moderation log written earlier in a transaction whose later step fails', async () => {
      store.seed(MODERATION_LOG, []);

      await expect(
        store.transaction(async (manager) => {
          await service.syncWebhookResult(delivery, manager as any);
          throw new Error('confession update failed');
        }),
      ).rejects.toThrow('confession update failed');

      expect(store.rows(MODERATION_LOG)).toHaveLength(0);
    });

    it('treats a redelivery after a rollback as new, not as a duplicate', async () => {
      store.seed(MODERATION_LOG, []);

      await expect(
        store.transaction(async (manager) => {
          await service.syncWebhookResult(delivery, manager as any);
          throw new Error('confession update failed');
        }),
      ).rejects.toThrow();

      const retried = await store.transaction((manager) =>
        service.syncWebhookResult(delivery, manager as any),
      );

      expect(retried.isIdempotent).toBe(false);
      expect(store.rows(MODERATION_LOG)).toHaveLength(1);
    });

    it('keeps the moderation log when the whole transaction commits', async () => {
      store.seed(MODERATION_LOG, []);

      await store.transaction((manager) =>
        service.syncWebhookResult(delivery, manager as any),
      );

      expect(store.rows(MODERATION_LOG)).toHaveLength(1);
      expect(store.rows(MODERATION_LOG)[0]).toMatchObject({
        confessionId: 'confession-2',
        moderationStatus: ModerationStatus.REJECTED,
      });
    });
  });
});
