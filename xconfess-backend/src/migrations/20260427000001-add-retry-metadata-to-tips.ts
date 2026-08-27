import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRetryMetadataToTips20260427000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add retry and reconciliation metadata columns to tips table
    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'retry_count',
        type: 'int',
        default: 0,
        comment: 'Number of verification/reconciliation retry attempts',
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'last_chain_status',
        type: 'varchar',
        length: '50',
        isNullable: true,
        comment: 'Last observed chain status during verification',
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'last_checked_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Timestamp of last chain status check',
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'reconciliation_metadata',
        type: 'jsonb',
        isNullable: true,
        comment: 'Additional reconciliation and debugging metadata',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tips', 'reconciliation_metadata');
    await queryRunner.dropColumn('tips', 'last_checked_at');
    await queryRunner.dropColumn('tips', 'last_chain_status');
    await queryRunner.dropColumn('tips', 'retry_count');
  }
}
