import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from "typeorm";

export class CreateTipsTable2026012600000 implements MigrationInterface {
    name = 'CreateTipsTable2026012600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'tips',
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
                        name: 'amount',
                        type: 'decimal',
                        precision: 20,
                        scale: 7,
                        isNullable: false,
                    },
                    {
                        name: 'tx_id',
                        type: 'varchar',
                        length: '64',
                        isUnique: true,
                        isNullable: false,
                    },
                    {
                        name: 'sender_address',
                        type: 'varchar',
                        length: '56',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            }),
            true,
        );

        // Create foreign key
        await queryRunner.createForeignKey(
            'tips',
            new TableForeignKey({
                columnNames: ['confession_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'anonymous_confessions',
                onDelete: 'CASCADE',
            }),
        );

        // Create indexes
        await queryRunner.createIndex(
            'tips',
            new TableIndex({
                name: 'IDX_tips_confession_id',
                columnNames: ['confession_id'],
            }),
        );

        await queryRunner.createIndex(
            'tips',
            new TableIndex({
                name: 'IDX_tips_tx_id',
                columnNames: ['tx_id'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.dropIndex('tips', 'IDX_tips_tx_id');
        await queryRunner.dropIndex('tips', 'IDX_tips_confession_id');

        // Drop foreign key (will be dropped with table)
        // Drop table
        await queryRunner.dropTable('tips');
    }
}
