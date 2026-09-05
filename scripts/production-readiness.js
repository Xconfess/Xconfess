#!/usr/bin/env node

const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const mode = args.has('--production') ? 'production' : 'local';
const includeFullTests = args.has('--full');
const includeSmoke = args.has('--smoke') || mode === 'production';

const checks = [
  ['backend build', 'npm', ['run', 'backend:build']],
  ['backend lint', 'npm', ['run', 'backend:lint']],
  [
    'backend focused readiness tests',
    'npm',
    [
      'test',
      '--workspace=xconfess-backend',
      '--',
      'analytics-event.service',
      'traction-metrics',
      'public-traction.controller',
      'chain-reconciliation',
      'soroban-event-checkpoint',
      'stellar-diagnostics.service',
      'stellar-config.service',
      'health.controller',
      '--runInBand',
    ],
  ],
  ['frontend lint', 'npm', ['run', 'frontend:lint']],
  ['frontend typecheck', 'npm', ['run', 'frontend:typecheck']],
  [
    'frontend focused readiness tests',
    'npm',
    [
      'test',
      '--workspace=xconfess-frontend',
      '--',
      'traction',
      'api/public/traction',
      '--runInBand',
    ],
  ],
  ['frontend build', 'npm', ['run', 'frontend:build']],
  ['contract env verification', 'npm', ['run', 'contracts:verify-env']],
  ['secret scanner self-test', 'npm', ['run', 'secret-scan:self-test']],
];

if (mode === 'production') {
  checks.splice(0, 0, ['deploy preflight', 'npm', ['run', 'deploy:preflight']]);
}

if (includeFullTests) {
  checks.push(['backend full tests', 'npm', ['run', 'backend:test']]);
  checks.push(['frontend full tests', 'npm', ['run', 'frontend:test']]);
  checks.push(['contract tests', 'npm', ['run', 'contract:test']]);
}

if (includeSmoke) {
  checks.push(['deployed smoke', 'npm', ['run', 'deploy:smoke']]);
}

function runCheck([name, command, commandArgs]) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  return {
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    code: result.status,
  };
}

const started = Date.now();
const results = checks.map(runCheck);
const failed = results.filter((result) => result.status !== 'passed');

console.log('\nProduction readiness summary');
for (const result of results) {
  console.log(`- ${result.status.toUpperCase()}: ${result.name}`);
}
console.log(`Duration: ${Math.max(1, Date.now() - started)}ms`);

if (failed.length > 0) {
  console.error(
    `\nReadiness failed: ${failed.map((result) => result.name).join(', ')}`,
  );
  process.exit(1);
}

console.log('\nReadiness passed.');
