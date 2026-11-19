#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const started = Date.now();
const container = `xconfess-restore-${process.pid}`;
const port = 55432;
process.env.PGPASSWORD = 'restore-only';
let stage = 'preflight';
let failed = false;
const details = [];

function run(args, opts = {}) {
  return spawnSync(args[0], args.slice(1), { encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', env: process.env, ...opts });
}

function finish(status, extra = {}) {
  const durationMs = Date.now() - started;
  const report = { status, stage, durationMs, timestamp: new Date().toISOString(), container: false, privateDataIncluded: false, ...extra };
  const outDir = path.join(root, 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'database-restore-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (status !== 'passed') process.exit(1);
}

const docker = run(['which', 'docker'], { capture: true });
if (docker.status !== 0) finish('failed', { reason: 'docker unavailable' });

stage = 'container-start';
const start = run(['docker', 'run', '--rm', '-d', '--name', container,
  '-e', 'POSTGRES_DB=xconfess_restore', '-e', 'POSTGRES_USER=restore', '-e', 'POSTGRES_PASSWORD=restore-only',
  '-p', `${port}:5432`, 'postgres:16-alpine'], { capture: true });
if (start.status !== 0) finish('failed', { reason: 'could not start disposable PostgreSQL' });

stage = 'container-ready';
let ready = false;
for (let i = 0; i < 30; i++) {
  const check = run(['docker', 'exec', container, 'pg_isready', '-U', 'restore', '-d', 'xconfess_restore'], { capture: true });
  if (check.status === 0) { ready = true; break; }
  run(['sleep', '1'], { capture: true });
}
if (!ready) {
  run(['docker', 'rm', '-f', container], { capture: true });
  finish('failed', { reason: 'PostgreSQL did not become ready' });
}

stage = 'restore';
const backupArg = process.argv.find((arg) => arg.startsWith('--backup='));
if (backupArg) {
  const backupFile = backupArg.slice('--backup='.length);
  if (!fs.existsSync(backupFile)) {
    run(['docker', 'rm', '-f', container], { capture: true });
    finish('failed', { reason: 'backup file not found' });
  }
  const backupSql = fs.readFileSync(backupFile, 'utf8');
  const restore = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'restore', '-d', 'xconfess_restore', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: backupSql });
  if (restore.status !== 0) {
    run(['docker', 'rm', '-f', container], { capture: true });
    const detail = restore.stderr?.trim().split('\n')[0] || 'psql restore command failed';
    finish('failed', { reason: `database restore command failed: ${detail}` });
  }
} else {
  const fixtureSql = `CREATE TABLE restore_verification (id integer PRIMARY KEY, label text NOT NULL);\nINSERT INTO restore_verification VALUES (1, 'representative_non_sensitive_fixture');\n`;
  const restore = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'restore', '-d', 'xconfess_restore', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: fixtureSql });
  if (restore.status !== 0) {
    run(['docker', 'rm', '-f', container], { capture: true });
    const detail = restore.stderr?.trim().split('\n')[0] || 'psql restore command failed';
    finish('failed', { reason: `representative fixture restore failed: ${detail}` });
  }
}

stage = 'migration-check';
const migrationEnv = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USERNAME: 'restore', DB_PASSWORD: 'restore-only', DB_NAME: 'xconfess_restore', TYPEORM_SYNCHRONIZE: 'false', TYPEORM_MIGRATIONS_RUN: 'false' };
const migration = run(['npm', 'run', 'backend:migration:show'], { capture: true, env: migrationEnv });
if (migration.status !== 0) {
  run(['docker', 'rm', '-f', container], { capture: true });
  finish('failed', { reason: 'migration metadata check failed' });
}

stage = 'health-check';
const healthSql = backupArg
  ? 'SELECT 1'
  : 'SELECT count(*) FROM restore_verification WHERE label = \'representative_non_sensitive_fixture\'';
const health = run(['docker', 'exec', container, 'psql', '-U', 'restore', '-d', 'xconfess_restore', '-tAc', healthSql], { capture: true });
const rows = health.stdout?.trim();
run(['docker', 'rm', '-f', container], { capture: true });
if (health.status !== 0 || (!backupArg && rows !== '1') || (backupArg && rows !== '1')) finish('failed', { reason: 'post-restore health query failed' });

finish('passed', { checks: ['disposable-postgres-ready', 'schema-or-fixture-restored', 'migration-metadata-visible', 'post-restore-query-readable'] });
