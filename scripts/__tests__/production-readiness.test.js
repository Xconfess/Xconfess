const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildChecks,
  createScorecard,
  parseOptions,
  renderMarkdownReport,
} = require('../production-readiness');

test('parseOptions enables production smoke checks', () => {
  const options = parseOptions(['--production']);

  assert.equal(options.mode, 'production');
  assert.equal(options.includeSmoke, true);
  assert.equal(options.includeFullTests, false);
  assert.equal(options.writeReport, true);
});

test('buildChecks keeps local readiness focused by default', () => {
  const checks = buildChecks(parseOptions([])).map(([name]) => name);

  assert.deepEqual(checks, [
    'backend build',
    'backend lint',
    'backend focused readiness tests',
    'frontend lint',
    'frontend typecheck',
    'frontend focused readiness tests',
    'frontend build',
    'contract env verification',
    'secret scanner self-test',
  ]);
});

test('createScorecard returns a schema-versioned failure when any check fails', () => {
  const scorecard = createScorecard({
    mode: 'local',
    startedAt: Date.UTC(2026, 8, 8, 12, 0, 0),
    durationMs: 25,
    results: [
      { name: 'backend build', status: 'passed', code: 0 },
      { name: 'frontend build', status: 'failed', code: 1 },
    ],
  });

  assert.equal(scorecard.schemaVersion, 1);
  assert.equal(scorecard.status, 'failed');
  assert.equal(scorecard.checks[0].status, 'PASS');
  assert.equal(scorecard.checks[1].status, 'FAIL');
  assert.equal(scorecard.checks[1].exitCode, 1);
});

test('renderMarkdownReport includes reviewer-readable scorecard rows', () => {
  const markdown = renderMarkdownReport({
    generatedAt: '2026-09-08T12:00:00.000Z',
    mode: 'production',
    status: 'passed',
    durationMs: 10,
    checks: [{ name: 'deployed smoke', status: 'PASS', exitCode: 0 }],
  });

  assert.match(markdown, /# Production Readiness Scorecard/);
  assert.match(markdown, /\| deployed smoke \| PASS \| 0 \|/);
});
