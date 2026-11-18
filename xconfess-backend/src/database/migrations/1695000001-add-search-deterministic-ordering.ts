import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddSearchDeterministicOrdering1695000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Issue #1943: Add deterministic tie-breaker for search results
    await queryRunner.addColumn(
      'anonymous_confessions',
      new TableColumn({
        name: 'search_score_tiebreaker',
        type: 'bigint',
        isNullable: true,
      }),
    );

    // Create composite index for stable sorting
    await queryRunner.createIndex(
      'anonymous_confessions',
      new TableIndex({
        name: 'idx_confessions_search_stable',
        columnNames: ['created_at', 'id'],
      }),
    );

    // Update existing rows with deterministic tiebreaker
    await queryRunner.query(`
      UPDATE anonymous_confessions
      SET search_score_tiebreaker =
        CAST(EXTRACT(EPOCH FROM created_at) AS BIGINT) * 1000000 +
        CAST(SUBSTRING(id, 1, 8) AS BIT(32))::INTEGER
      WHERE search_score_tiebreaker IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('anonymous_confessions', 'idx_confessions_search_stable');
    await queryRunner.dropColumn('anonymous_confessions', 'search_score_tiebreaker');
  }
}
