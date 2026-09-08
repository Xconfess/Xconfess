import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookSignatureValidationLog20260427000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('moderation_logs'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "moderation_logs"
        ADD COLUMN IF NOT EXISTS "signature_valid" boolean NULL,
        ADD COLUMN IF NOT EXISTS "payload_malformed" boolean DEFAULT false;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "moderation_logs"."signature_valid"
        IS 'Whether webhook signature was valid';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "moderation_logs"."payload_malformed"
        IS 'Whether webhook payload was malformed';
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_moderation_logs_delivery_hash"
      ON "moderation_logs" ((metadata->'webhook'->>'deliveryHash'))
      WHERE metadata->'webhook'->>'deliveryHash' IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('moderation_logs'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_moderation_logs_delivery_hash"`,
    );
    await queryRunner.query(`
      ALTER TABLE "moderation_logs"
        DROP COLUMN IF EXISTS "payload_malformed",
        DROP COLUMN IF EXISTS "signature_valid";
    `);
  }
}
