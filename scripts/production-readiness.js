#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCORECARD_SCHEMA_VERSION = 1;
const DEFAULT_REPORT_DIR = 'readiness-results';

function parseOptions(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const reportDirArg = argv.find((arg) => arg.startsWith('--report-dir='));

  return {
    mode: args.has('--production') ? 'production' : 'local',
    includeFullTests: args.has('--full'),
    includeSmoke: args.has('--smoke') || args.has('--production'),
    writeReport: !args.has('--no-report'),
    reportDir: reportDirArg
      ? reportDirArg.slice('--report-dir='.length)
      : DEFAULT_REPORT_DIR,
  };
}

function buildChecks({ mode, includeFullTests, includeSmoke }) {
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
    checks.splice(0, 0, [
      'deploy preflight',
      'npm',
      ['run', 'deploy:preflight'],
    ]);
  }

  if (includeFullTests) {
    checks.push(['backend full tests', 'npm', ['run', 'backend:test']]);
    checks.push(['frontend full tests', 'npm', ['run', 'frontend:test']]);
    checks.push(['contract tests', 'npm', ['run', 'contract:test']]);
  }

  if (includeSmoke) {
    checks.push(['deployed smoke', 'npm', ['run', 'deploy:smoke']]);
  }

  return checks;
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

function createScorecard({ mode, startedAt, durationMs, results }) {
  const failed = results.filter((result) => result.status !== 'passed');

  return {
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    startedAt: new Date(startedAt).toISOString(),
    mode,
    status: failed.length === 0 ? 'passed' : 'failed',
    durationMs,
    checks: results.map((result) => ({
      name: result.name,
      status: result.status === 'passed' ? 'PASS' : 'FAIL',
      exitCode: result.code,
    })),
  };
}

function renderMarkdownReport(scorecard) {
  const lines = [
    '# Production Readiness Scorecard',
    '',
    `Generated: ${scorecard.generatedAt}`,
    `Mode: ${scorecard.mode}`,
    `Status: ${scorecard.status.toUpperCase()}`,
    `Duration: ${scorecard.durationMs}ms`,
    '',
    '| Check | Result | Exit code |',
    '| --- | --- | --- |',
  ];

  for (const check of scorecard.checks) {
    lines.push(`| ${check.name} | ${check.status} | ${check.exitCode} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function writeScorecardReports(scorecard, reportDir) {
  const outputDir = path.resolve(process.cwd(), reportDir || DEFAULT_REPORT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'production-readiness-scorecard.json');
  const markdownPath = path.join(outputDir, 'production-readiness-scorecard.md');

  fs.writeFileSync(jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdownReport(scorecard));

  return { jsonPath, markdownPath };
}

function main() {
  const options = parseOptions();
  const checks = buildChecks(options);
  const started = Date.now();
  const results = checks.map(runCheck);
  const durationMs = Math.max(1, Date.now() - started);
  const scorecard = createScorecard({
    mode: options.mode,
    startedAt: started,
    durationMs,
    results,
  });

  console.log('\nProduction readiness summary');
  for (const result of results) {
    console.log(`- ${result.status.toUpperCase()}: ${result.name}`);
  }
  console.log(`Duration: ${durationMs}ms`);

  if (options.writeReport) {
    const written = writeScorecardReports(scorecard, options.reportDir);
    console.log(`Scorecard JSON: ${written.jsonPath}`);
    console.log(`Scorecard Markdown: ${written.markdownPath}`);
  }

  if (scorecard.status !== 'passed') {
    const failed = results.filter((result) => result.status !== 'passed');
    console.error(
      `\nReadiness failed: ${failed.map((result) => result.name).join(', ')}`,
    );
    process.exit(1);
  }

  console.log('\nReadiness passed.');
}

if (require.main === module) {
  main();
}

module.exports = {
  buildChecks,
  createScorecard,
  parseOptions,
  renderMarkdownReport,
  writeScorecardReports,
};
