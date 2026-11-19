'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lib = require('../lib/review-delay');
const CLI = path.resolve(__dirname, '..', 'contract-review-delay.js');

const T0 = '2026-01-01T00:00:00.000Z';
const ACTION = 'contract.deploy.mainnet';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'review-delay-'));
}

test('critical action catalogue and network mapping', () => {
  assert.equal(lib.isCriticalAction(ACTION), true);
  assert.equal(lib.isCriticalAction('contract.signer-rotation'), true);
  assert.equal(lib.isCriticalAction('contract.deploy.testnet'), false);
  assert.equal(lib.actionForNetwork('public'), ACTION);
  assert.equal(lib.actionForNetwork('mainnet'), ACTION);
  assert.equal(lib.actionForNetwork('testnet'), null);
  assert.equal(lib.actionForNetwork(''), null);
  assert.ok(lib.listActions().length >= 5);
});

test('delay bounds reject bypass values', () => {
  assert.equal(lib.normalizeDelaySeconds(1, 60), 1);
  assert.equal(lib.normalizeDelaySeconds(undefined, 60), 60);
  for (const bad of [0, -1, 1.5, 'abc', lib.MAX_DELAY_SECONDS + 1, Number.NaN]) {
    assert.throws(() => lib.normalizeDelaySeconds(bad, 60), /Delay must be an integer/);
  }
});

test('invariant: an unscheduled critical action can never be executed', () => {
  const ledger = lib.createEmptyLedger();
  const decision = lib.evaluate({ ledger, action: ACTION, now: T0 });
  assert.deepEqual(decision, {
    allowed: false,
    reason: 'not_scheduled',
    remainingSeconds: null,
    deadlineAt: null,
    status: null,
  });
});

test('time boundary: blocked one millisecond before the deadline, allowed at it', () => {
  const ledger = lib.createEmptyLedger();
  lib.schedule({ ledger, action: ACTION, now: T0, delaySeconds: 3600 });

  const before = lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T00:59:59.999Z' });
  assert.equal(before.allowed, false);
  assert.equal(before.reason, 'delay_active');
  assert.equal(before.remainingSeconds, 1);

  const at = lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T01:00:00.000Z' });
  assert.equal(at.allowed, true);
  assert.equal(at.reason, 'delay_elapsed');
  assert.equal(at.remainingSeconds, 0);

  const after = lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T01:00:00.001Z' });
  assert.equal(after.allowed, true);
});

test('invariant: cancellation blocks execution even after the deadline', () => {
  const ledger = lib.createEmptyLedger();
  lib.schedule({ ledger, action: ACTION, now: T0, delaySeconds: 60 });
  const { event } = lib.cancel({ ledger, action: ACTION, now: T0, actor: 'reviewer', reason: 'needs security review' });

  assert.equal(event.event, 'REVIEW_DELAY_CANCELLED');
  assert.equal(event.actor, 'reviewer');
  assert.equal(lib.evaluate({ ledger, action: ACTION, now: '2026-01-02T00:00:00.000Z' }).allowed, false);
  assert.equal(lib.evaluate({ ledger, action: ACTION, now: '2026-01-02T00:00:00.000Z' }).reason, 'cancelled');
});

test('invariant: clear removes the window and re-scheduling resets the clock', () => {
  const ledger = lib.createEmptyLedger();
  lib.schedule({ ledger, action: ACTION, now: T0, delaySeconds: 3600 });
  const cleared = lib.clear({ ledger, action: ACTION, now: '2026-01-01T00:30:00.000Z' });

  assert.equal(cleared.event.event, 'REVIEW_DELAY_CLEARED');
  assert.equal(cleared.event.had_schedule, true);
  assert.equal(lib.evaluate({ ledger, action: ACTION, now: '2026-01-02T00:00:00.000Z' }).reason, 'not_scheduled');

  const rescheduled = lib.schedule({ ledger, action: ACTION, now: '2026-01-01T00:45:00.000Z', delaySeconds: 3600 });
  assert.equal(rescheduled.event.previous_deadline_at, null);
  assert.equal(lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T01:00:00.000Z' }).allowed, false);
  assert.equal(lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T01:45:00.000Z' }).allowed, true);
});

test('invariant: an executed action cannot be replayed', () => {
  const ledger = lib.createEmptyLedger();
  lib.schedule({ ledger, action: ACTION, now: T0, delaySeconds: 60 });
  lib.markExecuted({ ledger, action: ACTION, now: '2026-01-01T00:01:00.000Z' });

  const decision = lib.evaluate({ ledger, action: ACTION, now: '2026-01-01T00:02:00.000Z' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'executed');
  assert.throws(() => lib.markExecuted({ ledger, action: ACTION, now: '2026-01-01T00:03:00.000Z' }), /no pending schedule/);
});

test('ledger and append-only events survive persistence', () => {
  const dir = tempDir();
  const ledger = lib.createEmptyLedger();
  const scheduled = lib.schedule({ ledger, action: ACTION, now: T0, delaySeconds: 60, actor: 'alice', reference: 'PR-1' });
  const cancelled = lib.cancel({ ledger, action: ACTION, now: T0, actor: 'bob', reason: 'more review' });
  const blocked = lib.recordBlocked({ action: ACTION, now: T0, reason: 'cancelled' });
  lib.persist(dir, ledger, [scheduled.event, cancelled.event, blocked]);

  const reloaded = lib.loadLedger(dir);
  assert.equal(reloaded.schedules[ACTION].status, 'cancelled');
  const events = fs
    .readFileSync(path.join(dir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    events.map((event) => event.event),
    ['REVIEW_DELAY_SCHEDULED', 'REVIEW_DELAY_CANCELLED', 'REVIEW_DELAY_BLOCKED'],
  );
  for (const event of events) {
    assert.equal(event.action, ACTION);
    assert.ok(!JSON.stringify(event).match(/sk_live_|ghp_|-----BEGIN/));
  }
});

test('run guard executes a command only after the window elapses', () => {
  const dir = tempDir();
  const marker = path.join(dir, 'command-ran.txt');
  const env = { ...process.env, REVIEW_DELAY_DIR: dir, MARKER: marker };
  const action = 'contract.signer-rotation';
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
  const markerScript = "require('fs').writeFileSync(process.env.MARKER, 'ran')";

  assert.equal(
    run(['schedule', '--action', action, '--delay-seconds', '60', '--now', T0, '--actor', 'test']).status,
    0,
  );
  const blocked = run([
    'run', '--action', action, '--now', '2026-01-01T00:00:30Z', '--', process.execPath, '-e', markerScript,
  ]);
  assert.equal(blocked.status, 1);
  assert.equal(fs.existsSync(marker), false);

  const allowed = run([
    'run', '--action', action, '--now', '2026-01-01T00:01:00Z', '--', process.execPath, '-e', markerScript,
  ]);
  assert.equal(allowed.status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'ran');

  const replay = run([
    'run', '--action', action, '--now', '2026-01-01T00:02:00Z', '--', process.execPath, '-e', markerScript,
  ]);
  assert.equal(replay.status, 1);
});

test('CLI enforces the gate with machine-readable exit codes', () => {
  const dir = tempDir();
  const env = { ...process.env, REVIEW_DELAY_DIR: dir };

  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });

  assert.equal(run(['list-actions']).status, 0);
  assert.equal(run(['action-for-network', 'public']).stdout.trim(), ACTION);
  assert.equal(run(['action-for-network', 'testnet']).stdout.trim(), '');

  const scheduled = run([
    'schedule',
    '--action',
    ACTION,
    '--actor',
    'alice',
    '--reference',
    'release-1',
    '--delay-seconds',
    '3600',
    '--now',
    T0,
    '--json',
  ]);
  assert.equal(scheduled.status, 0);
  assert.equal(JSON.parse(scheduled.stdout).schedule.deadline_at, '2026-01-01T01:00:00.000Z');

  assert.equal(run(['check', '--action', ACTION, '--now', '2026-01-01T00:59:59.999Z']).status, 1);
  assert.equal(run(['check', '--action', ACTION, '--now', '2026-01-01T01:00:00.000Z']).status, 0);

  assert.equal(run(['cancel', '--action', ACTION, '--now', '2026-01-01T01:00:01.000Z', '--reason', 'hold']).status, 0);
  assert.equal(run(['check', '--action', ACTION, '--now', '2026-01-01T02:00:00.000Z']).status, 1);

  assert.equal(run(['clear', '--action', ACTION, '--now', '2026-01-01T02:00:01.000Z']).status, 0);
  assert.equal(run(['check', '--action', ACTION, '--now', '2026-01-01T03:00:00.000Z']).status, 1);

  const events = run(['events', '--action', ACTION, '--json']);
  assert.equal(events.status, 0);
  const names = JSON.parse(events.stdout).map((event) => event.event);
  assert.ok(names.includes('REVIEW_DELAY_SCHEDULED'));
  assert.ok(names.includes('REVIEW_DELAY_BLOCKED'));
  assert.ok(names.includes('REVIEW_DELAY_CANCELLED'));
  assert.ok(names.includes('REVIEW_DELAY_CLEARED'));
});
