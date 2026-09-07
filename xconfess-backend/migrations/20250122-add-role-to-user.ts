import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddRoleToUser2025012200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user'))) {
      return;
    }

    // Add the role column
    if (!(await queryRunner.hasColumn('user', 'role'))) {
      await queryRunner.addColumn(
        'user',
        new TableColumn({
          name: 'role',
          type: 'enum',
          enum: ['user', 'admin'],
          default: "'user'",
        }),
      );
    }

    // Migrate existing isAdmin data to role
    if (await queryRunner.hasColumn('user', 'isAdmin')) {
      await queryRunner.query(`
        UPDATE "user"
        SET role = 'admin'
        WHERE "isAdmin" = true
      `);

      // Drop the old isAdmin column
      await queryRunner.dropColumn('user', 'isAdmin');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user'))) {
      return;
    }

    // Re-add isAdmin column
    if (!(await queryRunner.hasColumn('user', 'isAdmin'))) {
      await queryRunner.addColumn(
        'user',
        new TableColumn({
          name: 'isAdmin',
          type: 'boolean',
          default: false,
        }),
      );
    }

    // Migrate role data back to isAdmin
    if (await queryRunner.hasColumn('user', 'role')) {
      await queryRunner.query(`
        UPDATE "user"
        SET "isAdmin" = true
        WHERE role = 'admin'
      `);

      // Drop role column
      await queryRunner.dropColumn('user', 'role');
    }
  }
}
