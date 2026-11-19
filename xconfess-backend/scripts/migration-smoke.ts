import dataSource from '../data-source';

const REQUIRED_TABLES = [
  'audit_logs',
  'analytics_daily_rollups',
  'analytics_events',
  'confession_idempotency_records',
  'confession_tags',
  'feature_flags',
  'messages',
  'moderation_comments',
  'reports',
  'soroban_event_checkpoints',
  'tags',
  'tips',
  'user_anonymous_users',
  'wallet_backups',
  'wallets',
];

const REQUIRED_INDEXES = [
  'IDX_reports_status',
  'IDX_tips_confession_id',
  'IDX_wallets_public_key',
  'IDX_wallet_backups_wallet',
  'IDX_tags_name',
  'idx_analytics_events_name_occurred',
  'idx_cir_expires_at',
  'idx_confession_idempotency_records_expires_at',
  'idx_messages_thread_history',
  'idx_soroban_event_checkpoints_last_indexed',
];

async function runMigrationSmoke(): Promise<void> {
  try {
    await dataSource.initialize();

    const existingTables: Array<{ tablename: string }> = await dataSource.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    if (existingTables.length > 0) {
      throw new Error(
        `Expected an empty public schema; found: ${existingTables.map(({ tablename }) => tablename).join(', ')}`,
      );
    }

    const expectedMigrationCount = dataSource.migrations.length;
    if (expectedMigrationCount === 0) {
      throw new Error('No TypeORM migrations were loaded.');
    }

    const applied = await dataSource.runMigrations({ transaction: 'all' });
    const hasPendingMigrations = await dataSource.showMigrations();
    const migrationRows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*)::text AS count FROM "migrations"',
    );
    const recordedMigrationCount = Number(migrationRows[0]?.count ?? 0);

    if (
      hasPendingMigrations ||
      applied.length !== expectedMigrationCount ||
      recordedMigrationCount !== expectedMigrationCount
    ) {
      throw new Error(
        `Migration history is incomplete: loaded=${expectedMigrationCount}, applied=${applied.length}, recorded=${recordedMigrationCount}, pending=${hasPendingMigrations}`,
      );
    }

    const tableRows: Array<{ table_name: string }> = await dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      `,
      [REQUIRED_TABLES],
    );
    const presentTables = new Set(tableRows.map(({ table_name }) => table_name));
    const missingTables = REQUIRED_TABLES.filter(
      (tableName) => !presentTables.has(tableName),
    );

    const indexRows: Array<{ indexname: string }> = await dataSource.query(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY($1::text[])
      `,
      [REQUIRED_INDEXES],
    );
    const presentIndexes = new Set(indexRows.map(({ indexname }) => indexname));
    const missingIndexes = REQUIRED_INDEXES.filter(
      (indexName) => !presentIndexes.has(indexName),
    );

    if (missingTables.length > 0 || missingIndexes.length > 0) {
      throw new Error(
        [
          missingTables.length > 0
            ? `Missing tables: ${missingTables.join(', ')}`
            : undefined,
          missingIndexes.length > 0
            ? `Missing indexes: ${missingIndexes.join(', ')}`
            : undefined,
        ]
          .filter(Boolean)
          .join('. '),
      );
    }

    console.log(
      `Migration smoke passed: applied ${applied.length} migrations; verified ${REQUIRED_TABLES.length} tables and ${REQUIRED_INDEXES.length} indexes.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const configuredPassword = process.env.DB_PASSWORD;
    const safeMessage = configuredPassword
      ? message.split(configuredPassword).join('[redacted]')
      : message;
    console.error(`Migration smoke failed: ${safeMessage}`);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void runMigrationSmoke();
