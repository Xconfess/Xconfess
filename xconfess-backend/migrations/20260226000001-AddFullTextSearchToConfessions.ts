import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFullTextSearchToConfessions20260226000001 implements MigrationInterface {
    public name = 'AddFullTextSearchToConfessions20260226000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add tsvector column for full-text search
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN "search_vector" tsvector`);

        // Create function to update search vector
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_confession_search_vector()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.search_vector := to_tsvector('english', COALESCE(NEW.message, ''));
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Create trigger to automatically update search vector
        await queryRunner.query(`
            CREATE TRIGGER confession_search_vector_update
            BEFORE INSERT OR UPDATE ON "anonymous_confessions"
            FOR EACH ROW EXECUTE FUNCTION update_confession_search_vector();
        `);

        // Update existing records
        await queryRunner.query(`
            UPDATE "anonymous_confessions" 
            SET "search_vector" = to_tsvector('english', COALESCE(message, ''));
        `);

        // Create GIN index for better performance
        await queryRunner.query(`
            CREATE INDEX "idx_confession_search_vector" 
            ON "anonymous_confessions" USING GIN("search_vector");
        `);

        // Create additional index for ts_rank optimization
        await queryRunner.query(`
            CREATE INDEX "idx_confession_created_at" 
            ON "anonymous_confessions"("created_at" DESC);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_confession_created_at"`);
        await queryRunner.query(`DROP INDEX "idx_confession_search_vector"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS confession_search_vector_update ON "anonymous_confessions"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_confession_search_vector()`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "search_vector"`);
    }
}
