import { QueryRunner } from 'typeorm';
import { AddNotificationRecipientUnreadIndexes20261016000001 } from '../../migrations/20261016000001-add-notification-recipient-unread-indexes';
import { AddMessageHistoryPaginationIndexes20260927000001 } from '../../migrations/20260927000001-add-message-history-pagination-indexes';
import { AddConfessionAnonymousUserIndex20260927000002 } from '../../migrations/20260927000002-add-confession-anonymous-user-index';

const CREATE_INDEX_RE = /CREATE INDEX IF NOT EXISTS\s+(\w+)/gi;
const DROP_INDEX_RE = /DROP INDEX IF EXISTS\s+(\w+)/gi;

function indexNames(sql: string, re: RegExp): string[] {
  return Array.from(sql.matchAll(re), (match) => match[1]);
}

/**
 * Minimal in-memory QueryRunner that records DDL and answers the
 * `information_schema.columns` probe used to detect column casing.
 */
class RecordingQueryRunner {
  public queries: string[] = [];

  constructor(
    private readonly columns: Record<string, string[]> = {
      notifications: ['userId', 'isRead', 'createdAt', 'type'],
    },
  ) {}

  async query(sql: string, params?: unknown[]): Promise<unknown> {
    if (sql.includes('information_schema.columns')) {
      const table = params?.[0] as string;
      const columns = this.columns[table] ?? [];
      return columns.map((column_name) => ({ column_name }));
    }
    this.queries.push(sql);
    return undefined;
  }
}

async function upSql(
  migration: { up: (qr: QueryRunner) => Promise<void> },
  runner: RecordingQueryRunner,
): Promise<string[]> {
  await migration.up(runner as unknown as QueryRunner);
  return [...runner.queries];
}

async function downSql(
  migration: { down: (qr: QueryRunner) => Promise<void> },
  runner: RecordingQueryRunner,
): Promise<string[]> {
  await migration.down(runner as unknown as QueryRunner);
  return [...runner.queries];
}

describe('index migrations (#1986, #1987) — coverage and rollback', () => {
  describe('notification recipient/unread indexes (#1986)', () => {
    it('creates recipient, unread, and type/unread access-path indexes', async () => {
      const runner = new RecordingQueryRunner();
      const created = indexNames(
        (
          await upSql(
            new AddNotificationRecipientUnreadIndexes20261016000001(),
            runner,
          )
        ).join('\n'),
        CREATE_INDEX_RE,
      );

      expect(created).toEqual(
        expect.arrayContaining([
          'idx_notifications_recipient_created',
          'idx_notifications_recipient_unread',
          'idx_notifications_recipient_type_unread',
        ]),
      );
      // snake_case fallbacks must not be created when the table uses camelCase.
      expect(created.join(' ')).not.toContain('_snake');
    });

    it('rolls back every index it created', async () => {
      const upRunner = new RecordingQueryRunner();
      const created = indexNames(
        (
          await upSql(
            new AddNotificationRecipientUnreadIndexes20261016000001(),
            upRunner,
          )
        ).join('\n'),
        CREATE_INDEX_RE,
      );

      const downRunner = new RecordingQueryRunner();
      const dropped = indexNames(
        (
          await downSql(
            new AddNotificationRecipientUnreadIndexes20261016000001(),
            downRunner,
          )
        ).join('\n'),
        DROP_INDEX_RE,
      );

      for (const name of created) {
        expect(dropped).toContain(name);
      }
    });
  });

  describe('anonymous message conversation indexes (#1987)', () => {
    it('creates thread-history and sender-history indexes and rolls them back', async () => {
      const migration = new AddMessageHistoryPaginationIndexes20260927000001();

      const upRunner = new RecordingQueryRunner();
      const created = indexNames(
        (await upSql(migration, upRunner)).join('\n'),
        CREATE_INDEX_RE,
      );
      expect(created).toEqual(
        expect.arrayContaining([
          'idx_messages_thread_history',
          'idx_messages_sender_history',
        ]),
      );

      const downRunner = new RecordingQueryRunner();
      const dropped = indexNames(
        (await downSql(migration, downRunner)).join('\n'),
        DROP_INDEX_RE,
      );
      for (const name of created) {
        expect(dropped).toContain(name);
      }
    });

    it('indexes the confession anonymous-user membership column and rolls it back', async () => {
      const migration = new AddConfessionAnonymousUserIndex20260927000002();

      const upRunner = new RecordingQueryRunner();
      await upSql(migration, upRunner);
      expect(upRunner.queries.join('\n')).toContain(
        'idx_anonymous_confessions_anonymous_user_id',
      );
      expect(upRunner.queries.join('\n')).toContain('"anonymous_user_id"');

      const downRunner = new RecordingQueryRunner();
      await downSql(migration, downRunner);
      expect(downRunner.queries.join('\n')).toContain(
        'DROP INDEX IF EXISTS idx_anonymous_confessions_anonymous_user_id',
      );
    });
  });
});
