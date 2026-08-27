import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignConfessionSchema20260225140000 implements MigrationInterface {
    name = 'AlignConfessionSchema20260225140000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add view_count to anonymous_confessions
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "view_count" INTEGER NOT NULL DEFAULT 0`);

        // Add search_vector to anonymous_confessions
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "search_vector" tsvector`);

        // Create or replace function for search vector
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_confession_search_vector()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.search_vector := to_tsvector('english', COALESCE(NEW.message, ''));
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Create trigger - using DROP first to ensure it's clean (standard practice in our migrations)
        await queryRunner.query(`DROP TRIGGER IF EXISTS confession_search_vector_update ON "anonymous_confessions"`);
        await queryRunner.query(`
            CREATE TRIGGER confession_search_vector_update
            BEFORE INSERT OR UPDATE ON "anonymous_confessions"
            FOR EACH ROW EXECUTE FUNCTION update_confession_search_vector();
        `);

        // Update existing records for search_vector in batches to avoid long-running locks
        let hasMore = true;
        const batchSize = 5000;

        while (hasMore) {
            const result = await queryRunner.query(`
                WITH target_ids AS (
                    SELECT id FROM "anonymous_confessions"
                    WHERE search_vector IS NULL
                    LIMIT ${batchSize}
                ),
                updated AS (
                    UPDATE "anonymous_confessions"
                    SET search_vector = to_tsvector('english', COALESCE(message, ''))
                    WHERE id IN (SELECT id FROM target_ids)
                    RETURNING id
                )
                SELECT count(*) as count FROM updated;
            `);

            const count = parseInt(result[0].count);
            if (count < batchSize) {
                hasMore = false;
            }
        }

        // Create GIN index for search_vector
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_confession_search_vector" ON "anonymous_confessions" USING GIN(search_vector)`);

        // Create index for created_at
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_confession_created_at" ON "anonymous_confessions"("created_at" DESC)`);

        // Port legacy user active status if not exists
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Down migration for search vector and view count
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_confession_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_confession_search_vector"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS confession_search_vector_update ON "anonymous_confessions"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_confession_search_vector()`);

        // Full rollback of columns to ensure idempotency
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "is_active"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "search_vector"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "view_count"`);
    }
}
