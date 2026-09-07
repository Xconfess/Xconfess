import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSoftDeleteColumns2026022300000 implements MigrationInterface {
    name = 'AddSoftDeleteColumns2026022300000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add deleted_at column
        const hasDeletedAt = await queryRunner.hasColumn(
            'anonymous_confessions',
            'deleted_at',
        );
        if (!hasDeletedAt) {
            await queryRunner.addColumn(
                'anonymous_confessions',
                new TableColumn({
                    name: 'deleted_at',
                    type: 'timestamp',
                    isNullable: true,
                    default: null,
                }),
            );
        }

        // Add deleted_by column
        const hasDeletedBy = await queryRunner.hasColumn(
            'anonymous_confessions',
            'deleted_by',
        );
        if (!hasDeletedBy) {
            await queryRunner.addColumn(
                'anonymous_confessions',
                new TableColumn({
                    name: 'deleted_by',
                    type: 'varchar',
                    isNullable: true,
                    default: null,
                }),
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasDeletedAt = await queryRunner.hasColumn(
            'anonymous_confessions',
            'deleted_at',
        );
        if (hasDeletedAt) {
            await queryRunner.dropColumn('anonymous_confessions', 'deleted_at');
        }

        const hasDeletedBy = await queryRunner.hasColumn(
            'anonymous_confessions',
            'deleted_by',
        );
        if (hasDeletedBy) {
            await queryRunner.dropColumn('anonymous_confessions', 'deleted_by');
        }
    }
}
