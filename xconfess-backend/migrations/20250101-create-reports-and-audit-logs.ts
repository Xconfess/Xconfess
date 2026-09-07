import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateReportsAndAuditLogs2025010100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create reports table
    await queryRunner.createTable(
      new Table({
        name: 'reports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'confession_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'reporter_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'copyright', 'other'],
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
            default: "'pending'",
          },
          {
            name: 'resolved_by',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'resolved_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'resolutionNotes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for reports
    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_reports_confession_id',
        columnNames: ['confession_id'],
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_reports_reporter_id',
        columnNames: ['reporter_id'],
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_reports_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_reports_created_at',
        columnNames: ['createdAt'],
      }),
    );

    // Create foreign keys for reports
    await queryRunner.createForeignKey(
      'reports',
      new TableForeignKey({
        columnNames: ['confession_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'anonymous_confessions',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'reports',
      new TableForeignKey({
        columnNames: ['reporter_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'reports',
      new TableForeignKey({
        columnNames: ['resolved_by'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'SET NULL',
      }),
    );

    // Create audit_logs table
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'admin_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'action',
            type: 'enum',
            enum: [
              'report_resolved',
              'report_dismissed',
              'confession_deleted',
              'confession_hidden',
              'confession_unhidden',
              'user_banned',
              'user_unbanned',
              'user_admin_granted',
              'user_admin_revoked',
              'moderation_override',
              'bulk_action',
            ],
            isNullable: false,
          },
          {
            name: 'entity_type',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'entity_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for audit_logs
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_admin_id',
        columnNames: ['admin_id'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_action',
        columnNames: ['action'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_created_at',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_entity',
        columnNames: ['entity_type', 'entity_id'],
      }),
    );

    // Create foreign key for audit_logs
    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['admin_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_logs');
    await queryRunner.dropTable('reports');
  }
}
