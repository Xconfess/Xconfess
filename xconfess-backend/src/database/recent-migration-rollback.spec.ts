import { QueryRunner } from 'typeorm';
import { CreateConfessionIdempotencyRecords20260721000001 } from '../migrations/20260721000001-create-confession-idempotency-records';
import { AddAuditReportCompositeIndexes20260723000001 } from '../migrations/20260723000001-add-audit-report-composite-indexes';
import { BackfillDefaultKeyVersion20260725000001 } from '../migrations/20260725000001-backfill-default-key-version';
import { AddUniqueIdempotencyKeyToTips20260725000002 } from '../migrations/20260725000002-add-unique-idempotency-key-to-tips';
import { AddUniqueReactionConstraint20260725000003 } from '../migrations/20260725000003-add-unique-reaction-constraint';

/**
 * Rollback coverage for the most recent in-source migrations (#2170).
 *
 * Each migration is run against a recording QueryRunner, so these tests pin
 * the exact DDL that `up` and `down` issue. Data-loss caveats for every
 * migration are in docs/migration-rollback-guarantees.md.
 */
class RecordingQueryRunner {
  public queries: string[] = [];

  constructor(private readonly tables: Set<string>) {}

  async hasTable(table: string): Promise<boolean> {
    return this.tables.has(table);
  }

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql.replace(/\s+/g, ' ').trim());
    return undefined;
  }
}

const runner = (...tables: string[]) =>
  new RecordingQueryRunner(new Set(tables));

const asQueryRunner = (qr: RecordingQueryRunner) =>
  qr as unknown as QueryRunner;

const containing = (queries: string[], fragment: string) =>
  queries.filter((sql) => sql.includes(fragment));

describe('recent migration rollbacks (#2170)', () => {
  describe('CreateConfessionIdempotencyRecords20260721000001 (reversible; drops data)', () => {
    const migration = new CreateConfessionIdempotencyRecords20260721000001();

    it('creates the table, its indexes and the confession foreign key on up', async () => {
      const qr = runner('anonymous_confessions');

      await migration.up(asQueryRunner(qr));

      expect(
        containing(qr.queries, 'CREATE TABLE IF NOT EXISTS "confession_idempotency_records"'),
      ).toHaveLength(1);
      expect(containing(qr.queries, '"idx_cir_expires_at"')).toHaveLength(1);
      expect(containing(qr.queries, '"idx_cir_confession_id"')).toHaveLength(1);
      expect(containing(qr.queries, '"fk_cir_confession_id"').length).toBeGreaterThan(0);
    });

    it('drops the foreign key and indexes before dropping the table on down', async () => {
      const qr = runner();

      await migration.down(asQueryRunner(qr));

      const fkIndex = qr.queries.findIndex((sql) =>
        sql.includes('DROP CONSTRAINT IF EXISTS "fk_cir_confession_id"'),
      );
      const indexIndex = qr.queries.findIndex((sql) =>
        sql.includes('DROP INDEX IF EXISTS "idx_cir_confession_id"'),
      );
      const tableIndex = qr.queries.findIndex((sql) =>
        sql.includes('DROP TABLE IF EXISTS "confession_idempotency_records"'),
      );

      expect(fkIndex).toBeGreaterThanOrEqual(0);
      expect(indexIndex).toBeGreaterThan(fkIndex);
      expect(tableIndex).toBeGreaterThan(indexIndex);
    });
  });

  describe('AddAuditReportCompositeIndexes20260723000001 (reversible)', () => {
    const migration = new AddAuditReportCompositeIndexes20260723000001();
    const AUDIT_INDEXES = [
      'idx_audit_logs_admin_created',
      'idx_audit_logs_action_created',
      'idx_audit_logs_entity_type_created',
    ];
    const REPORT_INDEXES = [
      'idx_reports_status_created_id',
      'idx_reports_type_created_id',
    ];

    it('creates every composite index when both tables exist', async () => {
      const qr = runner('audit_logs', 'reports');

      await migration.up(asQueryRunner(qr));

      for (const name of [...AUDIT_INDEXES, ...REPORT_INDEXES]) {
        expect(containing(qr.queries, `"${name}"`)).toHaveLength(1);
      }
    });

    it('creates nothing on up when the tables are absent', async () => {
      const qr = runner();

      await migration.up(asQueryRunner(qr));

      expect(qr.queries).toHaveLength(0);
    });

    it('drops exactly the five indexes it created on down', async () => {
      const qr = runner();

      await migration.down(asQueryRunner(qr));

      const drops = qr.queries.filter((sql) =>
        sql.startsWith('DROP INDEX IF EXISTS'),
      );
      expect(drops).toHaveLength(AUDIT_INDEXES.length + REPORT_INDEXES.length);
      for (const name of [...AUDIT_INDEXES, ...REPORT_INDEXES]) {
        expect(containing(drops, `"${name}"`)).toHaveLength(1);
      }
    });
  });

  describe('BackfillDefaultKeyVersion20260725000001 (not reversible; down is a no-op)', () => {
    const migration = new BackfillDefaultKeyVersion20260725000001();

    it('sets key_version only where it is NULL on up', async () => {
      const qr = runner('anonymous_confessions');

      await migration.up(asQueryRunner(qr));

      expect(qr.queries).toHaveLength(1);
      expect(qr.queries[0]).toContain('WHERE "key_version" IS NULL');
    });

    it('issues no SQL on down, so rolling back leaves backfilled values in place', async () => {
      const qr = runner('anonymous_confessions');

      await migration.down(asQueryRunner(qr));

      expect(qr.queries).toHaveLength(0);
    });
  });

  describe('AddUniqueIdempotencyKeyToTips20260725000002 (reversible)', () => {
    const migration = new AddUniqueIdempotencyKeyToTips20260725000002();

    it('replaces the plain index with a partial unique index on up', async () => {
      const qr = runner('tips');

      await migration.up(asQueryRunner(qr));

      expect(qr.queries[0]).toContain('DROP INDEX IF EXISTS "IDX_tips_idempotency_key"');
      expect(qr.queries[1]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tips_idempotency_key"');
      expect(qr.queries[1]).toContain('WHERE "idempotency_key" IS NOT NULL');
    });

    it('restores the plain index and drops the unique one on down', async () => {
      const qr = runner('tips');

      await migration.down(asQueryRunner(qr));

      expect(qr.queries[0]).toContain('DROP INDEX IF EXISTS "UQ_tips_idempotency_key"');
      expect(qr.queries[1]).toContain('CREATE INDEX IF NOT EXISTS "IDX_tips_idempotency_key"');
    });

    it('does nothing on up or down when the tips table is absent', async () => {
      const upRunner = runner();
      const downRunner = runner();

      await migration.up(asQueryRunner(upRunner));
      await migration.down(asQueryRunner(downRunner));

      expect(upRunner.queries).toHaveLength(0);
      expect(downRunner.queries).toHaveLength(0);
    });
  });

  describe('AddUniqueReactionConstraint20260725000003 (reversible)', () => {
    const migration = new AddUniqueReactionConstraint20260725000003();

    it('creates the unique index on (confession_id, anonymous_user_id) on up', async () => {
      const qr = runner('reaction');

      await migration.up(asQueryRunner(qr));

      expect(qr.queries).toHaveLength(1);
      expect(qr.queries[0]).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS "uq_reaction_confession_user" ON "reaction" ("confession_id", "anonymous_user_id")',
      );
    });

    it('drops the unique index on down', async () => {
      const qr = runner('reaction');

      await migration.down(asQueryRunner(qr));

      expect(qr.queries).toEqual([
        'DROP INDEX IF EXISTS "uq_reaction_confession_user";',
      ]);
    });

    it('skips up when the reaction table is absent', async () => {
      const qr = runner();

      await migration.up(asQueryRunner(qr));

      expect(qr.queries).toHaveLength(0);
    });
  });
});
