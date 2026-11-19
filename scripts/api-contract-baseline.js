#!/usr/bin/env node
'use strict';

/**
 * Normalize the CI-generated OpenAPI document and compare it with the
 * committed baseline. Breaking changes fail the check; every change is
 * classified in a review report.
 *
 * Commands:
 *   normalize --spec=<file> [--output=<file>]
 *   check     --spec=<file> [--baseline=<file>] [--output=<file>] [--report=<file>]
 *   update    --spec=<file> [--baseline=<file>]
 *   seed-from-proxies [--baseline=<file>]
 */

const fs = require('fs');
const path = require('path');
const contract = require('./lib/openapi-contract');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BASELINE = path.join(ROOT, 'deployments', 'openapi-baseline.json');

function parseArgs(argv) {
  const options = { _: [] };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
    else if (arg.startsWith('--')) options[arg.slice(2)] = true;
    else options._.push(arg);
  }
  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON at ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function appendText(filePath, text) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, text, 'utf8');
}

function isSeedBaseline(baseline) {
  return Boolean(baseline?.['x-baseline-metadata']?.seed);
}

function maybeWriteOutput(options, normalized) {
  if (typeof options.output === 'string') {
    writeJson(options.output, normalized);
    console.log(`Normalized OpenAPI document written to: ${path.resolve(options.output)}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  const baselinePath = options.baseline || DEFAULT_BASELINE;

  if (command === 'normalize' || command === 'check' || command === 'update') {
    if (!options.spec) throw new Error('Provide --spec=/path/to/openapi.json.');
    const spec = readJson(options.spec);
    const normalized = contract.normalizeOpenApi(spec);

    if (command === 'normalize') {
      maybeWriteOutput(options, normalized);
      console.log(`Normalized digest: ${contract.normalizedDigest(spec)}`);
      return;
    }

    if (command === 'update') {
      const payload = {
        ...normalized,
        'x-baseline-metadata': {
          updated_at_utc: new Date().toISOString(),
          normalized_sha256: contract.normalizedDigest(spec),
          source: 'npm run api:contract:update',
          seed: false,
        },
      };
      writeJson(baselinePath, payload);
      console.log(`API contract baseline updated: ${path.resolve(baselinePath)}`);
      console.log(`Review the diff before committing. Normalized digest: ${payload['x-baseline-metadata'].normalized_sha256}`);
      return;
    }

    maybeWriteOutput(options, normalized);
    const baseline = readJson(baselinePath);
    const { changes, counts } = contract.compareOpenApi({ baseline, current: normalized });
    const report = contract.formatReport({
      changes,
      counts,
      baselineDigest: contract.normalizedDigest(baseline),
      currentDigest: contract.normalizedDigest(spec),
      seedBaseline: isSeedBaseline(baseline),
    });
    if (typeof options.report === 'string') appendText(options.report, report + '\n');
    console.log(report);

    if (options['allow-breaking'] || options.allowBreaking) {
      console.log('Breaking changes reported but allowed by --allow-breaking.');
      return;
    }
    if (counts.breaking > 0) {
      console.error(`API contract check failed: ${counts.breaking} breaking change(s). Update the baseline only after an explicit review.`);
      process.exitCode = 1;
    } else {
      console.log('API contract check passed: no breaking changes against the baseline.');
    }
    return;
  }

  if (command === 'seed-from-proxies') {
    const { collectFrontendProxyRoutes } = require('./check-api-contract-drift');
    const routes = collectFrontendProxyRoutes();
    const paths = {};
    for (const route of routes) {
      const key = contract.normalizePath(route.path);
      if (!paths[key]) paths[key] = {};
      // A seed pins only the operation identity: the real response set is
      // captured by `api:contract:update` from the running backend, so a
      // proxy route returning 201/204 must not look like a removed 200.
      paths[key][route.method.toLowerCase()] = { responses: {} };
    }
    const seed = {
      openapi: '3.0.0',
      info: { title: 'xConfess API contract baseline (seed)', version: '0.0.0' },
      paths,
      'x-baseline-metadata': {
        updated_at_utc: new Date().toISOString(),
        source: 'npm run api:contract:seed',
        seed: true,
        note: 'Derived from frontend proxy routes. Capture the full normalized contract with npm run api:contract:update once the backend is running.',
      },
    };
    writeJson(baselinePath, seed);
    console.log(`Seeded API baseline from ${routes.length} frontend proxy routes: ${path.resolve(baselinePath)}`);
    return;
  }

  throw new Error(`Unknown command '${command || ''}'. Use normalize, check, update, or seed-from-proxies.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
