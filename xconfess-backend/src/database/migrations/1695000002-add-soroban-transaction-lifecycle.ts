import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddSorobanTransactionLifecycle1695000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Issue #1960: Add Soroban transaction lifecycle tracking for tips
    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'submission_status',
        type: 'varchar',
        length: 50,
        default: "'submitted'",
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'submitted_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'confirmed_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'failed_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'failure_reason',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'expiry_block_height',
        type: 'bigint',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'ledger_sequence',
        type: 'bigint',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'soroban_metadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    // Create indexes for efficient querying by lifecycle status
    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'idx_tips_submission_status',
        columnNames: ['submission_status'],
      }),
    );

    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'idx_tips_submitted_at',
        columnNames: ['submitted_at'],
      }),
    );

    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'idx_tips_confirmed_at',
        columnNames: ['confirmed_at'],
      }),
    );

    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'idx_tips_status_timeline',
        columnNames: ['submission_status', 'submitted_at', 'confirmed_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('tips', 'idx_tips_status_timeline');
    await queryRunner.dropIndex('tips', 'idx_tips_confirmed_at');
    await queryRunner.dropIndex('tips', 'idx_tips_submitted_at');
    await queryRunner.dropIndex('tips', 'idx_tips_submission_status');

    await queryRunner.dropColumn('tips', 'soroban_metadata');
    await queryRunner.dropColumn('tips', 'ledger_sequence');
    await queryRunner.dropColumn('tips', 'expiry_block_height');
    await queryRunner.dropColumn('tips', 'failure_reason');
    await queryRunner.dropColumn('tips', 'failed_at');
    await queryRunner.dropColumn('tips', 'confirmed_at');
    await queryRunner.dropColumn('tips', 'submitted_at');
    await queryRunner.dropColumn('tips', 'submission_status');
  }
}
