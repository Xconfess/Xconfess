import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateTagsSystem2026012700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tags table
    await queryRunner.createTable(
      new Table({
        name: 'tags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
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

    // Create index on tag name
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tags_name" ON "tags" ("name")`,
    );

    // Create confession_tags junction table
    await queryRunner.createTable(
      new Table({
        name: 'confession_tags',
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
          },
          {
            name: 'tag_id',
            type: 'uuid',
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

    // Create indexes for efficient querying
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_confession_tags_confession_id" ON "confession_tags" ("confession_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_confession_tags_tag_id" ON "confession_tags" ("tag_id")`,
    );

    // Create composite unique index to prevent duplicate tag assignments
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_confession_tags_confession_tag_unique" ON "confession_tags" ("confession_id", "tag_id")`,
    );

    // Add foreign key constraints
    if (await queryRunner.hasTable('anonymous_confessions')) {
      await queryRunner.createForeignKey(
        'confession_tags',
        new TableForeignKey({
          columnNames: ['confession_id'],
          referencedColumnNames: ['id'],
          referencedTableName: 'anonymous_confessions',
          onDelete: 'CASCADE',
        }),
      );
    }

    await queryRunner.createForeignKey(
      'confession_tags',
      new TableForeignKey({
        columnNames: ['tag_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tags',
        onDelete: 'CASCADE',
      }),
    );

    // Seed predefined tags
    await queryRunner.query(`
      INSERT INTO tags (name, description) VALUES
        ('funny', 'Humorous or amusing confessions'),
        ('sad', 'Sad or melancholic confessions'),
        ('inspiring', 'Motivational or uplifting confessions'),
        ('love', 'Confessions about love and relationships'),
        ('heartbreak', 'Confessions about heartbreak and loss'),
        ('advice', 'Seeking or giving advice'),
        ('confession', 'General confessions'),
        ('rant', 'Venting or expressing frustration'),
        ('grateful', 'Expressing gratitude'),
        ('regret', 'Confessions about regrets')
      ON CONFLICT (name) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const confessionTagsTable = await queryRunner.getTable('confession_tags');
    if (confessionTagsTable) {
      const foreignKeys = confessionTagsTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('confession_tags', foreignKey);
      }
    }

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_confession_tags_confession_tag_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_confession_tags_tag_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_confession_tags_confession_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tags_name"`);

    // Drop tables
    await queryRunner.dropTable('confession_tags', true);
    await queryRunner.dropTable('tags', true);
  }
}
