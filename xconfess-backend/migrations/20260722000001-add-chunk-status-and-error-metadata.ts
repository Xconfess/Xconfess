import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1453 — resumable data export processor.
 *
 * Adds two columns to {@link export_chunks}:
 *   - `status`         default 'COMPLETED' so legacy rows remain queryable.
 *   - `error_metadata` nullable jsonb for safe, non-sensitive failure info.
 *
 * Also enforces a unique constraint on (export_request_id, chunk_index) so a
 * resumed run can only ever occupy a given chunk slot once, regardless of how
 * many times the worker restarts.
 */
export class AddChunkStatusAndErrorMetadata20260722000001
  implements MigrationInterface
{
  name = 'AddChunkStatusAndErrorMetadata20260722000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "export_chunks" ADD COLUMN "status" varchar(16) NOT NULL DEFAULT 'COMPLETED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_chunks" ADD COLUMN "error_metadata" jsonb`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_export_chunks_request_index" ON "export_chunks" ("export_request_id", "chunk_index")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_export_chunks_request_index"`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_chunks" DROP COLUMN IF EXISTS "error_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_chunks" DROP COLUMN IF EXISTS "status"`,
    );
  }
}
