import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateUserAnonymousUsers2026012400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_anonymous_users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'anonymous_user_id',
            type: 'uuid',
            isNullable: false,
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

    await queryRunner.createIndex(
      'user_anonymous_users',
      new TableIndex({
        name: 'IDX_user_anonymous_users_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'user_anonymous_users',
      new TableIndex({
        name: 'IDX_user_anonymous_users_anon_id',
        columnNames: ['anonymous_user_id'],
      }),
    );

    await queryRunner.createIndex(
      'user_anonymous_users',
      new TableIndex({
        name: 'IDX_user_anonymous_users_created_at',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createForeignKey(
      'user_anonymous_users',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_anonymous_users',
      new TableForeignKey({
        columnNames: ['anonymous_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'anonymous_user',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_anonymous_users');
  }
}
