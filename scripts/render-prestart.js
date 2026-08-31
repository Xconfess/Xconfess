#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

function enabled(name) {
  return TRUE_VALUES.has(String(process.env[name] || '').toLowerCase());
}

function listMigrationFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => /^[0-9].*\.js$/.test(file))
    .map((file) => path.join(dir, file));
}

function loadMigrations() {
  const files = [
    ...listMigrationFiles('xconfess-backend/dist/migrations'),
    ...listMigrationFiles('xconfess-backend/dist/src/migrations'),
  ];

  const migrations = [];
  for (const file of files) {
    const exports = require(file);
    for (const value of Object.values(exports)) {
      if (typeof value !== 'function') continue;
      const instance = new value();
      const name = instance.name || value.name;
      const match = String(name).match(/(\d{13,14})$/);
      if (!match) continue;
      migrations.push({
        name,
        timestamp: Number(match[1].slice(-13)),
      });
    }
  }

  const unique = new Map();
  for (const migration of migrations) {
    unique.set(`${migration.timestamp}:${migration.name}`, migration);
  }

  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists;
    `,
    [tableName],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists;
    `,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

async function ensureConfessionReadinessIndexes(client) {
  const hasSearchVector = await columnExists(
    client,
    'anonymous_confessions',
    'search_vector',
  );
  const hasCreatedAt = await columnExists(
    client,
    'anonymous_confessions',
    'created_at',
  );

  if (!hasSearchVector || !hasCreatedAt) {
    console.log(
      'Render prestart schema repair skipped: confession readiness columns are missing.',
    );
    return;
  }

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_confession_search_vector"
    ON "anonymous_confessions" USING GIN ("search_vector");
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_confession_created_at"
    ON "anonymous_confessions" ("created_at" DESC);
  `);
  console.log('Render prestart ensured confession readiness indexes.');
}

/**
 * Pure decision logic for the Render prestart baseline step. Kept side-effect
 * free so it can be unit tested against the four cases that matter:
 *   - the feature flags are disabled                -> skip
 *   - no compiled migrations are on disk            -> error (build did not run)
 *   - the database is fresh (core tables missing)   -> skip, never baseline
 *   - migration history already has rows            -> skip, never duplicate rows
 *   - core tables exist and history is empty        -> baseline
 *
 * @param {{
 *   baselineEnabled: boolean,
 *   migrationsRunEnabled: boolean,
 *   migrationsAvailable: boolean,
 *   coreTablesPresent: boolean,
 *   migrationHistoryCount: number,
 * }} state
 * @returns {{ action: 'skip' | 'baseline' | 'error', reason: string }}
 */
function evaluateBaselineDecision(state) {
  const {
    baselineEnabled,
    migrationsRunEnabled,
    migrationsAvailable,
    coreTablesPresent,
    migrationHistoryCount,
  } = state;

  if (!baselineEnabled) {
    return { action: 'skip', reason: 'TYPEORM_BASELINE_EXISTING_SCHEMA is not enabled.' };
  }
  if (!migrationsRunEnabled) {
    return { action: 'skip', reason: 'TYPEORM_MIGRATIONS_RUN is not enabled.' };
  }
  if (!migrationsAvailable) {
    return {
      action: 'error',
      reason: 'No compiled migrations found. Build must run before render:prestart.',
    };
  }
  if (!coreTablesPresent) {
    return { action: 'skip', reason: 'database does not look pre-synchronized.' };
  }
  if (Number(migrationHistoryCount) > 0) {
    return { action: 'skip', reason: 'migrations table already has entries.' };
  }
  return { action: 'baseline', reason: 'core tables exist and migration history is empty.' };
}

async function main() {
  const baselineEnabled = enabled('TYPEORM_BASELINE_EXISTING_SCHEMA');
  const migrationsRunEnabled = enabled('TYPEORM_MIGRATIONS_RUN');

  // Resolve everything we can decide before touching the database.
  const flagDecision = evaluateBaselineDecision({
    baselineEnabled,
    migrationsRunEnabled,
    migrationsAvailable: true,
    coreTablesPresent: true,
    migrationHistoryCount: 0,
  });
  if (flagDecision.action === 'skip') {
    console.log(`Render prestart baseline skipped: ${flagDecision.reason}`);
    return;
  }

  const migrations = loadMigrations();
  const noMigrationsDecision = evaluateBaselineDecision({
    baselineEnabled,
    migrationsRunEnabled,
    migrationsAvailable: migrations.length > 0,
    coreTablesPresent: true,
    migrationHistoryCount: 0,
  });
  if (noMigrationsDecision.action === 'error') {
    throw new Error(noMigrationsDecision.reason);
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    const hasUserTable = await tableExists(client, 'user');
    const hasConfessionsTable = await tableExists(client, 'anonymous_confessions');
    const coreTablesPresent = hasUserTable && hasConfessionsTable;

    if (!coreTablesPresent) {
      const decision = evaluateBaselineDecision({
        baselineEnabled,
        migrationsRunEnabled,
        migrationsAvailable: true,
        coreTablesPresent,
        migrationHistoryCount: 0,
      });
      console.log(`Render prestart baseline skipped: ${decision.reason}`);
      return;
    }

    await ensureConfessionReadinessIndexes(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
        "id" SERIAL NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
      );
    `);

    const existing = await client.query('SELECT COUNT(*)::int AS count FROM "migrations";');
    const migrationHistoryCount = existing.rows[0]?.count ?? 0;

    const decision = evaluateBaselineDecision({
      baselineEnabled,
      migrationsRunEnabled,
      migrationsAvailable: migrations.length > 0,
      coreTablesPresent,
      migrationHistoryCount,
    });

    if (decision.action !== 'baseline') {
      console.log(`Render prestart baseline skipped: ${decision.reason}`);
      return;
    }

    await client.query('BEGIN');
    for (const migration of migrations) {
      await client.query(
        'INSERT INTO "migrations"("timestamp", "name") VALUES ($1, $2);',
        [migration.timestamp, migration.name],
      );
    }
    await client.query('COMMIT');
    console.log(`Render prestart baselined ${migrations.length} migrations for an existing synchronized schema.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { evaluateBaselineDecision, loadMigrations };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
