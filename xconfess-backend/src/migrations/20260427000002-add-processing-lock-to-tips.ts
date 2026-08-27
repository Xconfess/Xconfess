import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProcessingLockToTips20260427000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add processing lock columns to prevent double-crediting during concurrent verify/reconciliation
    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'processing_lock',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: 'Lock identifier to prevent concurrent processing',
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'locked_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Timestamp when processing lock was acquired',
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'locked_by',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Process identifier that acquired the lock (verify/reconciliation)',
      }),
    );

    // Create index for efficient lock queries
    await queryRunner.query(`
      CREATE INDEX "IDX_tips_processing_lock" ON "tips" ("processing_lock") 
      WHERE "processing_lock" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tips_processing_lock"`);
    await queryRunner.dropColumn('tips', 'locked_by');
    await queryRunner.dropColumn('tips', 'locked_at');
    await queryRunner.dropColumn('tips', 'processing_lock');
  }
}
