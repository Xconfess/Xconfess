#!/usr/bin/env node
'use strict';

/**
 * CLI for the critical-contract review delay gate.
 *
 * Examples:
 *   node scripts/contract-review-delay.js list-actions
 *   node scripts/contract-review-delay.js schedule --action contract.deploy.mainnet \
 *     --actor alice --reference PR-1234
 *   node scripts/contract-review-delay.js check --action contract.deploy.mainnet
 *   node scripts/contract-review-delay.js cancel --action contract.deploy.mainnet --reason "needs more review"
 *   node scripts/contract-review-delay.js clear --action contract.deploy.mainnet
 *   node scripts/contract-review-delay.js events --action contract.deploy.mainnet
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');
const lib = require('./lib/review-delay');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = process.env.REVIEW_DELAY_DIR || path.join(ROOT, '.review-delay');

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

function requireAction(options) {
  if (typeof options.action !== 'string' || !options.action) {
    throw new Error('Missing required --action <id>. Run `list-actions` to see valid action IDs.');
  }
  if (!lib.isCriticalAction(options.action)) {
    throw new Error(`Unknown action '${options.action}'. Run \`list-actions\` to see valid action IDs.`);
  }
  return options.action;
}

function print(value, options) {
  if (options.json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function humanDecision(action, decision) {
  if (decision.allowed) {
    return `ALLOWED: '${action}' passed its review window (deadline ${decision.deadlineAt}).`;
  }
  if (decision.reason === 'delay_active') {
    return `BLOCKED: '${action}' review window is still active. ${decision.remainingSeconds}s remaining (deadline ${decision.deadlineAt}).`;
  }
  return `BLOCKED: '${action}' is not executable (${decision.reason}). Schedule it before attempting this change.`;
}

function main() {
  const rawArgs = process.argv.slice(2);
  const separator = rawArgs.indexOf('--');
  const options = parseArgs(separator >= 0 ? rawArgs.slice(0, separator) : rawArgs);
  const runArgs = separator >= 0 ? rawArgs.slice(separator + 1) : [];
  const command = options._[0] || 'help';
  const dir = path.resolve(options.dir || DEFAULT_DIR);

  if (command === 'help' || command === '-h' || command === '--help') {
    console.log(`Review delay CLI (ledger: ${dir})

Commands:
  list-actions                          Show actions that require a review delay
  action-for-network <network>          Print the critical action for a network (empty if none)
  schedule --action <id> [opts]         Start a review window (resets an existing one)
  status   --action <id> [opts]         Show current schedule state
  check    --action <id> [opts]         Exit 0 only when the window has elapsed
  run      --action <id> -- <cmd> [args]  Execute a command only after the window elapses
  record   --action <id> [opts]         Mark an allowed action as executed
  cancel   --action <id> [--reason r]   Cancel a pending window (idempotent)
  clear    --action <id> [--reason r]   Remove a schedule entirely (idempotent)
  events   [--action <id>]              Show the append-only event log

Options:
  --delay-seconds N   Delay override (must respect the policy bounds)
  --actor NAME        Who scheduled / cancelled / recorded the action
  --reference TEXT    PR, ticket, or release identifier
  --now ISO           Override the clock (testing / backfill only)
  --dir PATH          Ledger directory override
  --json              Machine-readable output
  --no-event          Do not record a blocked event when 'check' fails`);
    return;
  }

  if (command === 'list-actions') {
    print(lib.listActions(), options);
    return;
  }

  if (command === 'action-for-network') {
    const network = options._[1];
    if (!network) throw new Error('action-for-network requires a network name.');
    const action = lib.actionForNetwork(network);
    if (action) console.log(action);
    return;
  }

  if (command === 'events') {
    const file = path.join(dir, 'events.jsonl');
    if (!fs.existsSync(file)) {
      print([], options);
      return;
    }
    const events = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => !options.action || event.action === options.action);
    print(options.json ? events : events.map((event) => JSON.stringify(event)).join('\n'), options);
    return;
  }

  const action = requireAction(options);
  const ledger = lib.loadLedger(dir);

  switch (command) {
    case 'schedule': {
      const result = lib.schedule({
        ledger,
        action,
        now: options.now,
        delaySeconds: options['delay-seconds'],
        actor: typeof options.actor === 'string' ? options.actor : 'unknown',
        reference: typeof options.reference === 'string' ? options.reference : '',
      });
      lib.persist(dir, ledger, [result.event]);
      print({ status: 'scheduled', schedule: ledger.schedules[action], event: result.event }, options);
      break;
    }
    case 'status': {
      const decision = lib.evaluate({ ledger, action, now: options.now });
      print({ action, schedule: ledger.schedules[action] || null, decision }, options);
      break;
    }
    case 'check': {
      const decision = lib.evaluate({ ledger, action, now: options.now });
      const events = decision.allowed || options['no-event']
        ? []
        : [
            lib.recordBlocked({
              action,
              now: options.now,
              reason: decision.reason,
              actor: typeof options.actor === 'string' ? options.actor : 'unknown',
              reference: typeof options.reference === 'string' ? options.reference : '',
            }),
          ];
      if (events.length) lib.persist(dir, ledger, events);
      print({ action, allowed: decision.allowed, decision }, options);
      if (!decision.allowed) {
        if (!options.json) console.error(humanDecision(action, decision));
        process.exitCode = 1;
      }
      break;
    }
    case 'run': {
      if (runArgs.length === 0) throw new Error('run requires a command after --.');
      const decision = lib.evaluate({ ledger, action, now: options.now });
      if (!decision.allowed) {
        lib.persist(dir, ledger, [
          lib.recordBlocked({
            action,
            now: options.now,
            reason: decision.reason,
            actor: typeof options.actor === 'string' ? options.actor : 'unknown',
            reference: typeof options.reference === 'string' ? options.reference : '',
          }),
        ]);
        console.error(humanDecision(action, decision));
        process.exitCode = 1;
        break;
      }
      const result = spawnSync(runArgs[0], runArgs.slice(1), { stdio: 'inherit', env: process.env });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        // A failed command leaves the window pending, so it can be retried.
        process.exitCode = result.status ?? 1;
        break;
      }
      const recorded = lib.markExecuted({
        ledger,
        action,
        now: options.now,
        actor: typeof options.actor === 'string' ? options.actor : 'unknown',
        reference: typeof options.reference === 'string' ? options.reference : '',
      });
      lib.persist(dir, ledger, [recorded.event]);
      console.log(`Review window elapsed; command completed and execution recorded for '${action}'.`);
      break;
    }
    case 'record': {
      const result = lib.markExecuted({
        ledger,
        action,
        now: options.now,
        actor: typeof options.actor === 'string' ? options.actor : 'unknown',
        reference: typeof options.reference === 'string' ? options.reference : '',
      });
      lib.persist(dir, ledger, [result.event]);
      print({ status: 'executed', schedule: ledger.schedules[action], event: result.event }, options);
      break;
    }
    case 'cancel': {
      const result = lib.cancel({
        ledger,
        action,
        now: options.now,
        actor: typeof options.actor === 'string' ? options.actor : 'unknown',
        reason: typeof options.reason === 'string' ? options.reason : '',
      });
      lib.persist(dir, ledger, [result.event]);
      print({ status: 'cancelled', schedule: ledger.schedules[action], event: result.event }, options);
      break;
    }
    case 'clear': {
      const result = lib.clear({
        ledger,
        action,
        now: options.now,
        actor: typeof options.actor === 'string' ? options.actor : 'unknown',
        reason: typeof options.reason === 'string' ? options.reason : '',
      });
      lib.persist(dir, ledger, [result.event]);
      print({ status: 'cleared', schedule: null, event: result.event }, options);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}. Run \`help\` for usage.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
