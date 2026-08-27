import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataProcessingConsentToPrivacySettings1774880000000
  implements MigrationInterface
{
  name = 'AddDataProcessingConsentToPrivacySettings1774880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dataProcessingConsent: true to all existing privacy_settings JSONB objects
    // where the key is missing.
    await queryRunner.query(`
      UPDATE "user" 
      SET "privacy_settings" = "privacy_settings" || '{"dataProcessingConsent": true}'::jsonb 
      WHERE "privacy_settings"->'dataProcessingConsent' IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the dataProcessingConsent key from privacy_settings JSONB
    await queryRunner.query(`
      UPDATE "user" 
      SET "privacy_settings" = "privacy_settings" - 'dataProcessingConsent'
    `);
  }
}
