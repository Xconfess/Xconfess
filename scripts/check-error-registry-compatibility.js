#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY = path.join(ROOT, 'deployments', 'error-registry-history.json');
const FIXTURE = path.join(ROOT, 'xconfess-contracts', 'contracts', 'tests', 'backend_verification_fixtures.rs');

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function parseFixtureRegistry() {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const entries = [];
  const blockRegex = /ErrorCodeFixture\s*\{\s*error_code:\s*(\d+)\s*,\s*error_name:\s*"([^"]+)"\s*,\s*classification:\s*ErrorClassification::(\w+)\s*,\s*http_status:\s*(\d+)\s*,?\s*\}/g;
  for (const match of text.matchAll(blockRegex)) {
    entries.push({ code: Number(match[1]), name: match[2], classification: match[3], http_status: Number(match[4]) });
  }
  return entries;
}

function parseSourceConstants() {
  const text = fs.readFileSync(path.join(ROOT, 'xconfess-contracts', 'contracts', 'error.rs'), 'utf8');
  const entries = new Map();
  for (const match of text.matchAll(/pub\s+const\s+(TIPPING_[A-Z_]+):\s*u32\s*=\s*(\d+)/g)) {
    entries.set(Number(match[2]), match[1].replace(/^TIPPING_/, ''));
  }
  const tipping = fs.readFileSync(path.join(ROOT, 'xconfess-contracts', 'contracts', 'anonymous-tipping', 'src', 'errors.rs'), 'utf8');
  for (const match of tipping.matchAll(/pub\s+const\s+(INVALID_TIP_AMOUNT|METADATA_TOO_LONG|TOTAL_OVERFLOW|NONCE_OVERFLOW|UNAUTHORIZED|CONTRACT_PAUSED|RATE_LIMITED|INVALID_RATE_LIMIT_CONFIG|TOKEN_NOT_CONFIGURED|SETTLEMENT_REPLAY|SETTLEMENT_NOT_FOUND|RECIPIENT_MISMATCH):\s*u32\s*=\s*(\d+)/g)) {
    entries.set(Number(match[2]), match[1]);
  }
  return entries;
}

function validate(history, fixtureEntries, sourceConstants) {
  const errors = [];
  const entries = history?.entries;
  if (!Array.isArray(entries)) return ['Error registry history must contain an entries array.'];

  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  const byName = new Map(entries.map((entry) => [entry.name, entry.code]));
  for (const entry of entries) {
    if (byCode.get(entry.code) !== entry) errors.push(`Duplicate historical error code: ${entry.code}`);
    if (byName.has(entry.name) && byName.get(entry.name) !== entry.code) errors.push(`Duplicate historical error name: ${entry.name}`);
  }

  for (const fixture of fixtureEntries) {
    const historical = byCode.get(fixture.code);
    if (!historical) {
      errors.push(`Accidental new or unregistered fixture code ${fixture.code} (${fixture.name}); add and review it in the historical registry before release.`);
      continue;
    }
    for (const field of ['name', 'classification', 'http_status']) {
      if (historical[field] !== fixture[field]) errors.push(`Code ${fixture.code}: ${field} drift (historical=${JSON.stringify(historical[field])}, current=${JSON.stringify(fixture[field])}).`);
    }
  }

  for (const [code, name] of sourceConstants) {
    const historical = byCode.get(code);
    if (!historical) continue;
    if (historical.name !== name) {
      errors.push(`Code ${code}: source name ${name} differs from historical name ${historical.name}.`);
    }
  }
  return errors;
}

function main() {
  const errors = validate(readJson(HISTORY), parseFixtureRegistry(), parseSourceConstants());
  if (errors.length) {
    console.error('Contract error registry compatibility failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Contract error registry compatibility passed: historical codes and classifications are stable.');
  }
}

if (require.main === module) main();
module.exports = { parseFixtureRegistry, parseSourceConstants, validate };
