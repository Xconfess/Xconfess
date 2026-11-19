'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scanner = require('../scan-artifacts');
const { findSecrets, isValidStellarSecret, syntheticStellarSecret } = require('../lib/secret-patterns');
const { loadPolicy } = require('../validate-fixtures');

const policy = loadPolicy();
const allowlist = new Set(policy.allowed_placeholder_values);

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  for (const entry of [
    'xconfess-backend/dist',
    'xconfess-frontend/.next/static/chunks',
    'xconfess-contracts/target/wasm32v1-none/release',
    'deployments',
  ]) {
    fs.mkdirSync(path.join(dir, entry), { recursive: true });
  }
  return dir;
}

test('Stellar secret detection uses StrKey checksum validation', () => {
  const valid = syntheticStellarSecret(0x7f);
  assert.equal(isValidStellarSecret(valid), true);
  assert.equal(isValidStellarSecret(`S${'A'.repeat(55)}`), false);
  assert.deepEqual(findSecrets(valid).map((finding) => finding.rule_id), ['stellar-secret-seed']);
  assert.deepEqual(findSecrets(`S${'A'.repeat(55)}`), []);
});

test('allowlisted synthetic values never produce findings', () => {
  const synthetic = [
    'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'sk-proj-REDACTED',
    'seed_alice@example.test',
  ].join('\n');
  assert.deepEqual(findSecrets(synthetic, { allowedValues: allowlist }), []);
});

test('collectTargets covers backend, frontend, Docker, contract, and archive artifacts', () => {
  const dir = tempRepo();
  try {
    fs.writeFileSync(path.join(dir, 'Dockerfile.backend'), 'FROM node:22\n');
    fs.writeFileSync(path.join(dir, 'xconfess-backend/dist/index.js'), 'console.log(1)\n');
    fs.writeFileSync(path.join(dir, 'xconfess-frontend/.next/static/chunks/main.js'), 'window.x = 1\n');
    fs.writeFileSync(path.join(dir, 'xconfess-contracts/target/wasm32v1-none/release/confession_anchor.wasm'), 'wasm');
    fs.writeFileSync(path.join(dir, 'deployments/testnet.json'), '{}');
    fs.writeFileSync(path.join(dir, 'release.tar.gz'), 'archive');

    const targets = scanner.collectTargets(dir).map((target) => target.relative.replace(/\\/g, '/'));
    assert.ok(targets.includes('Dockerfile.backend'));
    assert.ok(targets.includes('xconfess-backend/dist/index.js'));
    assert.ok(targets.includes('xconfess-frontend/.next/static/chunks/main.js'));
    assert.ok(targets.includes('xconfess-contracts/target/wasm32v1-none/release/confession_anchor.wasm'));
    assert.ok(targets.includes('deployments/testnet.json'));
    assert.ok(targets.includes('release.tar.gz'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanFile reports high-confidence secrets with remediation guidance', () => {
  const dir = tempRepo();
  try {
    const bundle = path.join(dir, 'xconfess-backend/dist/index.js');
    fs.writeFileSync(bundle, `const key = "sk_live_${'d'.repeat(30)}";\n`);
    const [finding] = scanner.scanFile({ absolute: bundle, relative: 'xconfess-backend/dist/index.js' }, allowlist).findings;
    assert.equal(finding.rule_id, 'stripe-live-key');
    assert.ok(finding.matched.startsWith('sk_l'));
    assert.ok(finding.remediation.length > 20);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanAll scans binary WASM and archives without missing embedded strings', () => {
  const dir = tempRepo();
  try {
    fs.writeFileSync(
      path.join(dir, 'xconfess-contracts/target/wasm32v1-none/release/confession_anchor.wasm'),
      Buffer.from(`binary prefix -----BEGIN EC PRIVATE KEY----- binary suffix`),
    );
    fs.writeFileSync(path.join(dir, 'bundle.zip'), Buffer.from(`ghp_${'e'.repeat(36)}`));
    fs.writeFileSync(path.join(dir, 'deployments/synthetic.json'), JSON.stringify({ key: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' }));

    const result = scanner.scanAll(dir, policy);
    const rules = new Set(result.findings.map((finding) => finding.rule_id));
    assert.ok(rules.has('private-key-block'));
    assert.ok(rules.has('github-pat'));
    assert.ok(!result.findings.some((finding) => finding.file.includes('synthetic.json')));
    assert.ok(scanner.formatFindings(result).includes('synthetic release') === false);
    assert.ok(scanner.formatFindings(result).includes('high-confidence finding'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('self-test passes end to end', () => {
  assert.equal(scanner.selfTest(), true);
});
