import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDeliveryReliability1790000000000
  implements MigrationInterface
{
  name = 'NotificationDeliveryReliability1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_events_status_enum" ADD VALUE IF NOT EXISTS 'SKIPPED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "sourceKey" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notifications_sourceKey_unique" ON "notifications" ("sourceKey") WHERE "sourceKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_notifications_sourceKey_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "sourceKey"`,
    );
  }
}
