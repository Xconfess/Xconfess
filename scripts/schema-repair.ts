/**
 * schema-repair.ts — Safe schema repair for local dev databases.
 *
 * Usage (from monorepo root):
 *   npm run backend:schema:repair
 *
 * Purpose:
 *   Local dev databases that were bootstrapped via TypeORM `synchronize: true`
 *   may be missing columns and indexes that migrations add. This script brings
 *   those databases into alignment WITHOUT wiping data.
 *
 *   This script is NOT a replacement for migrations and MUST NOT be used in
 *   staging or production. For deployment databases, run:
 *     npm run backend:migration:run
 *
 * What it repairs:
 *   - Adds `search_vector` tsvector column to `anonymous_confessions` if absent.
 *   - Adds `view_count` integer column to `anonymous_confessions` if absent.
 *   - Creates `idx_confession_search_vector` GIN index if absent.
 *   - Creates `idx_confession_created_at` index if absent.
 *   - Backfills `search_vector` for existing rows.
 *   - Records each applied repair in the console so contributors know what changed.
 *
 * All operations are idempotent (IF NOT EXISTS guards or column-existence checks
 * are used throughout), so re-running is safe.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '..', 'xconfess-backend', '.env'),
});

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '55432', 10);
const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const DB_NAME = process.env.DB_NAME || 'xconfess';

async function main(): Promise<void> {
  console.log('🔧  xConfess schema-repair — local dev only');
  console.log(
    `   Connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USERNAME}`,
  );

  const ds = new DataSource({
    type: 'postgres',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    synchronize: false,
    logging: false,
  });

  await ds.initialize();
  console.log('   Connection established.\n');

  const repairs: string[] = [];

  // ── 1. anonymous_confessions: search_vector column ──────────────────────────
  const [searchVectorRow] = await ds.query<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'anonymous_confessions'
        AND column_name  = 'search_vector'
    ) AS exists;
  `);

  if (!searchVectorRow?.exists) {
    console.log('  → Adding column: anonymous_confessions.search_vector');
    await ds.query(
      `ALTER TABLE "anonymous_confessions" ADD COLUMN "search_vector" tsvector`,
    );
    repairs.push('Added column: anonymous_confessions.search_vector');
  } else {
    console.log('  ✓ Column already present: anonymous_confessions.search_vector');
  }

  // ── 2. anonymous_confessions: view_count column ─────────────────────────────
  const [viewCountRow] = await ds.query<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'anonymous_confessions'
        AND column_name  = 'view_count'
    ) AS exists;
  `);

  if (!viewCountRow?.exists) {
    console.log('  → Adding column: anonymous_confessions.view_count');
    await ds.query(
      `ALTER TABLE "anonymous_confessions" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0`,
    );
    repairs.push('Added column: anonymous_confessions.view_count');
  } else {
    console.log('  ✓ Column already present: anonymous_confessions.view_count');
  }

  // ── 3. search_vector function + trigger ─────────────────────────────────────
  console.log('  → Installing/replacing search vector trigger function');
  await ds.query(`
    CREATE OR REPLACE FUNCTION update_confession_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', COALESCE(NEW.message, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await ds.query(`
    DROP TRIGGER IF EXISTS confession_search_vector_update ON "anonymous_confessions";
  `);
  await ds.query(`
    CREATE TRIGGER confession_search_vector_update
    BEFORE INSERT OR UPDATE ON "anonymous_confessions"
    FOR EACH ROW EXECUTE FUNCTION update_confession_search_vector();
  `);
  repairs.push('Created/replaced trigger: confession_search_vector_update');

  // ── 4. Backfill search_vector for existing rows ──────────────────────────────
  const [{ count }] = await ds.query<{ count: string }[]>(`
    SELECT COUNT(*) AS count FROM "anonymous_confessions" WHERE search_vector IS NULL;
  `);
  const nullCount = parseInt(count, 10);

  if (nullCount > 0) {
    console.log(`  → Backfilling search_vector for ${nullCount} row(s) ...`);
    await ds.query(`
      UPDATE "anonymous_confessions"
      SET search_vector = to_tsvector('english', COALESCE(message, ''))
      WHERE search_vector IS NULL;
    `);
    repairs.push(`Backfilled search_vector for ${nullCount} row(s)`);
  } else {
    console.log('  ✓ search_vector already populated for all rows');
  }

  // ── 5. GIN index: idx_confession_search_vector ───────────────────────────────
  await ds.query(`
    CREATE INDEX IF NOT EXISTS "idx_confession_search_vector"
    ON "anonymous_confessions" USING GIN("search_vector");
  `);
  console.log(
    '  ✓ Index ensured: idx_confession_search_vector (GIN, search_vector)',
  );

  // ── 6. Index: idx_confession_created_at ─────────────────────────────────────
  await ds.query(`
    CREATE INDEX IF NOT EXISTS "idx_confession_created_at"
    ON "anonymous_confessions"("created_at" DESC);
  `);
  console.log(
    '  ✓ Index ensured: idx_confession_created_at (created_at DESC)',
  );

  // ── Summary ──────────────────────────────────────────────────────────────────
  await ds.destroy();

  console.log('\n────────────────────────────────────────');
  if (repairs.length === 0) {
    console.log('✅  Schema already up to date — nothing to repair.');
  } else {
    console.log(`✅  Schema repair complete. ${repairs.length} change(s) applied:`);
    repairs.forEach((r) => console.log(`   • ${r}`));
    console.log(
      '\n   Verify with: GET http://localhost:5000/api/health/ready',
    );
  }
  console.log('────────────────────────────────────────\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\n❌  schema-repair failed:', message);
  console.error(
    '   Make sure Postgres is running (npm run dev:services) and',
    'xconfess-backend/.env contains the correct DB_* variables.\n',
  );
  process.exit(1);
});
