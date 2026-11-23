import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddMessageThrottlingAndReportPriority1695000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Issue #1942: Add message throttling fields
    await queryRunner.addColumn(
      'messages',
      new TableColumn({
        name: 'sender_id',
        type: 'uuid',
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'messages',
      new TableColumn({
        name: 'throttle_key',
        type: 'varchar',
        length: 255,
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'messages',
      new TableColumn({
        name: 'rate_limit_window',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'idx_messages_throttle_key_window',
        columnNames: ['throttle_key', 'rate_limit_window'],
      }),
    );

    // Issue #1948: Add moderation priority fields
    await queryRunner.addColumn(
      'reports',
      new TableColumn({
        name: 'priority',
        type: 'smallint',
        default: 0,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'reports',
      new TableColumn({
        name: 'priority_reason',
        type: 'varchar',
        length: 255,
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'reports',
      new TableColumn({
        name: 'priority_calculated_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'idx_reports_priority_status',
        columnNames: ['priority', 'status', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('reports', 'idx_reports_priority_status');
    await queryRunner.dropColumn('reports', 'priority_calculated_at');
    await queryRunner.dropColumn('reports', 'priority_reason');
    await queryRunner.dropColumn('reports', 'priority');

    await queryRunner.dropIndex('messages', 'idx_messages_throttle_key_window');
    await queryRunner.dropColumn('messages', 'rate_limit_window');
    await queryRunner.dropColumn('messages', 'throttle_key');
    await queryRunner.dropColumn('messages', 'sender_id');
  }
}
