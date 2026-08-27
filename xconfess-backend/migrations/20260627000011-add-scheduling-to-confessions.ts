import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSchedulingToConfessions20260627000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'anonymous_confessions',
      new TableColumn({
        name: 'status',
        type: 'varchar',
        default: "'published'",
      }),
    );

    await queryRunner.addColumn(
      'anonymous_confessions',
      new TableColumn({
        name: 'publish_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('anonymous_confessions', 'publish_at');
    await queryRunner.dropColumn('anonymous_confessions', 'status');
  }
}
