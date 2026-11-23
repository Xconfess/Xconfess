import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddParentIdToComments2026012700001 implements MigrationInterface {
  name = 'AddParentIdToComments2026012700001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('comments'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('comments', 'parent_id'))) {
      await queryRunner.addColumn(
        'comments',
        new TableColumn({
          name: 'parent_id',
          type: 'integer',
          isNullable: true,
        }),
      );
    }

    const table = await queryRunner.getTable('comments');
    const hasParentIdForeignKey = table?.foreignKeys.some((foreignKey) =>
      foreignKey.columnNames.includes('parent_id'),
    );
    if (!hasParentIdForeignKey) {
      await queryRunner.createForeignKey(
        'comments',
        new TableForeignKey({
          columnNames: ['parent_id'],
          referencedTableName: 'comments',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('comments');
    const fk = table?.foreignKeys.find(
      (f) => f.columnNames.indexOf('parent_id') !== -1,
    );
    if (fk) {
      await queryRunner.dropForeignKey('comments', fk);
    }
    if (await queryRunner.hasColumn('comments', 'parent_id')) {
      await queryRunner.dropColumn('comments', 'parent_id');
    }
  }
}
