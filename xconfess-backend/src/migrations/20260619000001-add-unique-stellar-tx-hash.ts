import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueStellarTxHash20260619000001 implements MigrationInterface {
  name = 'AddUniqueStellarTxHash20260619000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add unique constraint to stellar_tx_hash column
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'UQ_anonymous_confessions_stellar_tx_hash'
        ) THEN
          ALTER TABLE "anonymous_confessions" 
          ADD CONSTRAINT "UQ_anonymous_confessions_stellar_tx_hash" 
          UNIQUE ("stellar_tx_hash");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "anonymous_confessions" 
      DROP CONSTRAINT IF EXISTS "UQ_anonymous_confessions_stellar_tx_hash"
    `);
  }
}
