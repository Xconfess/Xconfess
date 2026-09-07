import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDeliveryReliability1790000000000
  implements MigrationInterface
{
  name = 'NotificationDeliveryReliability1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'outbox_events_status_enum'
        ) THEN
          ALTER TYPE "public"."outbox_events_status_enum" ADD VALUE IF NOT EXISTS 'SKIPPED';
        END IF;
      END $$;
    `);

    if (await queryRunner.hasTable('notifications')) {
      await queryRunner.query(
        `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "sourceKey" character varying`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notifications_sourceKey_unique" ON "notifications" ("sourceKey") WHERE "sourceKey" IS NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_notifications_sourceKey_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "sourceKey"`,
    );
  }
}
