import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1480: Guarantee tip verification cannot double-credit on concurrent requests.
 *
 * This migration converts the non-unique index on `tips.idempotency_key` into a
 * DB-enforced partial UNIQUE index (WHERE idempotency_key IS NOT NULL).
 *
 * The partial uniqueness means:
 *   - Rows inserted by the background reconciliation worker that do not yet have
 *     an idempotency key are unaffected.
 *   - Any two concurrent HTTP verify calls for the same (confessionId, txId) pair
 *     compute the same SHA256 key and race to INSERT — only one will succeed;
 *     the other receives PG error 23505 (unique_violation) and is redirected to
 *     the canonical-replay path in TippingService.tryInsertSentinelTip().
 *
 * Safe to run against existing data: the idempotency key was already unique
 * per (confessionId, txId) by design; this migration simply promotes that
 * application-level invariant to a DB constraint.
 */
export class AddUniqueIdempotencyKeyToTips20260725000002
  implements MigrationInterface
{
  name = 'AddUniqueIdempotencyKeyToTips20260725000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the old non-unique index added in 20260527000001 (if it exists).
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tips_idempotency_key";
    `);

    // 2. Create a partial unique index so NULL values (reconciler-created rows)
    //    are excluded from the uniqueness check.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tips_idempotency_key"
        ON "tips" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_tips_idempotency_key";
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tips_idempotency_key"
        ON "tips" ("idempotency_key");
    `);
  }
}
