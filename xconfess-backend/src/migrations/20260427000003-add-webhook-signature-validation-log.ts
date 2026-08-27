import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWebhookSignatureValidationLog20260427000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add signature validation tracking to moderation logs
    await queryRunner.addColumn(
      'moderation_logs',
      new TableColumn({
        name: 'signature_valid',
        type: 'boolean',
        isNullable: true,
        comment: 'Whether webhook signature was valid',
      }),
    );

    await queryRunner.addColumn(
      'moderation_logs',
      new TableColumn({
        name: 'payload_malformed',
        type: 'boolean',
        default: false,
        comment: 'Whether webhook payload was malformed',
      }),
    );

    // Create unique index on delivery hash to enforce idempotency at DB level
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_moderation_logs_delivery_hash" 
      ON "moderation_logs" ((metadata->>'webhook'->>'deliveryHash'))
      WHERE metadata->'webhook'->>'deliveryHash' IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_moderation_logs_delivery_hash"`);
    await queryRunner.dropColumn('moderation_logs', 'payload_malformed');
    await queryRunner.dropColumn('moderation_logs', 'signature_valid');
  }
}
