import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddIdempotencyKeyToTips20260527000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tips',
      new TableColumn({
        name: 'idempotency_key',
        type: 'varchar',
        length: '128',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'IDX_tips_idempotency_key',
        columnNames: ['idempotency_key'],
      }),
    );

    // Create unique index on confession_id + txId for idempotency enforcement
    await queryRunner.createIndex(
      'tips',
      new TableIndex({
        name: 'IDX_tips_confession_txid_unique',
        columnNames: ['confession_id', 'tx_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('tips', 'IDX_tips_confession_txid_unique');
    await queryRunner.dropIndex('tips', 'IDX_tips_idempotency_key');
    await queryRunner.dropColumn('tips', 'idempotency_key');
  }
}
