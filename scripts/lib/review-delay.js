#!/usr/bin/env node
'use strict';

/**
 * Review-delay gate for critical contract changes.
 *
 * A critical action cannot be executed until an approved schedule has existed
 * for at least its delay window. State and events are append-only JSON/JSONL
 * under a local (gitignored) ledger directory so a reviewer can inspect every
 * transition. The module is dependency-free for CI use.
 */

const fs = require('fs');
const path = require('path');

const MAX_DELAY_SECONDS = 30 * 24 * 60 * 60; // 30 days - prevents "infinite" queues
const DAY = 24 * 60 * 60;

const CRITICAL_ACTIONS = Object.freeze({
  'contract.deploy.mainnet': {
    description: 'Deploying release WASM to a public/mainnet Stellar network',
    defaultDelaySeconds: DAY,
  },
  'contract.signer-rotation': {
    description: 'Rotating a contract signer or deployer key alias',
    defaultDelaySeconds: 2 * DAY,
  },
  'contract.schema-migration': {
    description: 'Applying a versioned on-chain storage migration',
    defaultDelaySeconds: DAY,
  },
  'contract.governance-critical-action': {
    description: 'Executing a governance proposal that changes contract settings',
    defaultDelaySeconds: DAY,
  },
  'contract.emergency-pause-change': {
    description: 'Changing a pause/unpause state on a live contract',
    defaultDelaySeconds: 60 * 60,
  },
});

const NETWORK_ACTION_MAP = Object.freeze({
  public: 'contract.deploy.mainnet',
  mainnet: 'contract.deploy.mainnet',
  production: 'contract.deploy.mainnet',
});

function isCriticalAction(action) {
  return Object.prototype.hasOwnProperty.call(CRITICAL_ACTIONS, action);
}

function actionForNetwork(network) {
  return NETWORK_ACTION_MAP[String(network || '').toLowerCase()] || null;
}

function normalizeDelaySeconds(value, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > MAX_DELAY_SECONDS) {
    throw new Error(
      `Delay must be an integer between 1 and ${MAX_DELAY_SECONDS} seconds (received ${JSON.stringify(raw)}).`,
    );
  }
  return seconds;
}

function nowMs(now) {
  const value = now === undefined ? new Date() : new Date(now);
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new Error(`Invalid timestamp: ${JSON.stringify(now)}`);
  return time;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function createEmptyLedger() {
  return { version: 1, schedules: {} };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read review-delay ledger at ${filePath}: ${error.message}`);
  }
}

function loadLedger(dir) {
  const ledger = readJson(path.join(dir, 'ledger.json'), null);
  if (ledger === null) return createEmptyLedger();
  if (!ledger || typeof ledger !== 'object' || !ledger.schedules || typeof ledger.schedules !== 'object') {
    throw new Error('Review-delay ledger is corrupt: expected an object with a schedules object.');
  }
  return ledger;
}

function appendEvents(dir, events) {
  if (events.length === 0) return;
  fs.mkdirSync(dir, { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  fs.appendFileSync(path.join(dir, 'events.jsonl'), lines, 'utf8');
}

function persist(dir, ledger, events) {
  fs.mkdirSync(dir, { recursive: true });
  appendEvents(dir, events);
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

function makeEvent(name, fields) {
  return { event: name, at: iso(fields.now), ...fields };
}

/**
 * Schedule (or re-schedule) a critical action. Re-scheduling resets the clock,
 * so a short delay can never be substituted for an already-running window.
 */
function schedule({ ledger, action, now, delaySeconds, actor = 'unknown', reference = '' }) {
  if (!isCriticalAction(action)) throw new Error(`Unknown critical action: ${action}`);
  const seconds = normalizeDelaySeconds(delaySeconds, CRITICAL_ACTIONS[action].defaultDelaySeconds);
  const started = nowMs(now);
  const deadline = started + seconds * 1000;
  const previous = ledger.schedules[action];

  ledger.schedules[action] = {
    action,
    status: 'pending',
    scheduled_at: iso(started),
    delay_seconds: seconds,
    deadline_at: iso(deadline),
    actor,
    reference,
    updated_at: iso(started),
  };

  const event = makeEvent('REVIEW_DELAY_SCHEDULED', {
    now: started,
    action,
    actor,
    reference,
    delay_seconds: seconds,
    deadline_at: iso(deadline),
    previous_deadline_at: previous ? previous.deadline_at : null,
  });
  return { ledger, event };
}

function cancel({ ledger, action, now, actor = 'unknown', reason = '' }) {
  if (!isCriticalAction(action)) throw new Error(`Unknown critical action: ${action}`);
  const started = nowMs(now);
  const current = ledger.schedules[action];
  const wasPending = Boolean(current && current.status === 'pending');

  if (wasPending) {
    ledger.schedules[action] = { ...current, status: 'cancelled', updated_at: iso(started), cancel_reason: reason };
  }

  const event = makeEvent('REVIEW_DELAY_CANCELLED', {
    now: started,
    action,
    actor,
    reason,
    noop: !wasPending,
    deadline_at: current ? current.deadline_at : null,
  });
  return { ledger, event };
}

/** Clear the stored schedule entirely; a cleared action must be re-scheduled. */
function clear({ ledger, action, now, actor = 'unknown', reason = '' }) {
  if (!isCriticalAction(action)) throw new Error(`Unknown critical action: ${action}`);
  const started = nowMs(now);
  const current = ledger.schedules[action] || null;
  delete ledger.schedules[action];

  const event = makeEvent('REVIEW_DELAY_CLEARED', {
    now: started,
    action,
    actor,
    reason,
    had_schedule: Boolean(current),
    previous_status: current ? current.status : null,
  });
  return { ledger, event };
}

/** Pure evaluation: no state is mutated, so it is safe to call repeatedly. */
function evaluate({ ledger, action, now }) {
  const started = nowMs(now);
  const scheduleEntry = ledger.schedules[action];
  if (!scheduleEntry) {
    return { allowed: false, reason: 'not_scheduled', remainingSeconds: null, deadlineAt: null, status: null };
  }
  if (scheduleEntry.status !== 'pending') {
    return {
      allowed: false,
      reason: scheduleEntry.status,
      remainingSeconds: null,
      deadlineAt: scheduleEntry.deadline_at,
      status: scheduleEntry.status,
    };
  }
  const deadline = new Date(scheduleEntry.deadline_at).getTime();
  if (!Number.isFinite(deadline)) {
    return { allowed: false, reason: 'invalid_deadline', remainingSeconds: null, deadlineAt: null, status: 'pending' };
  }
  if (started < deadline) {
    return {
      allowed: false,
      reason: 'delay_active',
      remainingSeconds: Math.ceil((deadline - started) / 1000),
      deadlineAt: scheduleEntry.deadline_at,
      status: 'pending',
    };
  }
  return {
    allowed: true,
    reason: 'delay_elapsed',
    remainingSeconds: 0,
    deadlineAt: scheduleEntry.deadline_at,
    status: 'pending',
  };
}

function markExecuted({ ledger, action, now, actor = 'unknown', reference = '' }) {
  if (!isCriticalAction(action)) throw new Error(`Unknown critical action: ${action}`);
  const started = nowMs(now);
  const current = ledger.schedules[action];
  if (!current || current.status !== 'pending') {
    throw new Error(`Cannot record execution for '${action}': no pending schedule.`);
  }
  const decision = evaluate({ ledger, action, now: started });
  if (!decision.allowed) {
    throw new Error(`Cannot record execution for '${action}': ${decision.reason}.`);
  }
  ledger.schedules[action] = { ...current, status: 'executed', updated_at: iso(started), executed_at: iso(started) };
  const event = makeEvent('REVIEW_DELAY_EXECUTED', {
    now: started,
    action,
    actor,
    reference,
    deadline_at: current.deadline_at,
  });
  return { ledger, event };
}

function recordBlocked({ action, now, reason, actor = 'unknown', reference = '' }) {
  return makeEvent('REVIEW_DELAY_BLOCKED', {
    now: nowMs(now),
    action,
    actor,
    reference,
    reason,
  });
}

function listActions() {
  return Object.entries(CRITICAL_ACTIONS).map(([id, definition]) => ({ id, ...definition }));
}

module.exports = {
  MAX_DELAY_SECONDS,
  CRITICAL_ACTIONS,
  NETWORK_ACTION_MAP,
  isCriticalAction,
  actionForNetwork,
  normalizeDelaySeconds,
  createEmptyLedger,
  loadLedger,
  appendEvents,
  persist,
  schedule,
  cancel,
  clear,
  evaluate,
  markExecuted,
  recordBlocked,
  listActions,
};
