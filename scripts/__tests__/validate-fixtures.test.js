'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  POLICY_PATH,
  loadPolicy,
  validatePolicy,
  validateFixtureText,
  validateAll,
  selfTest,
} = require('../validate-fixtures');
const { syntheticStellarSecret } = require('../lib/secret-patterns');

const policy = loadPolicy(POLICY_PATH);

test('committed synthetic identity policy is internally consistent', () => {
  assert.deepEqual(validatePolicy(policy), []);
  assert.ok(policy.synthetic_users.length >= 4);
  assert.ok(policy.synthetic_contracts.length >= 1);
  assert.ok(policy.allowed_placeholder_values.length >= 5);
  assert.deepEqual(validateAll().findings, []);
});

test('policy rejects real emails, unconstrained usernames and real contract IDs', () => {
  const broken = JSON.parse(JSON.stringify(policy));
  broken.synthetic_users[0].email = 'alice@company.example';
  broken.synthetic_users[1].username = 'bob';
  broken.synthetic_users[2].display_name = 'Jane Doe';
  broken.synthetic_contracts[0].contract_id = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  const errors = validatePolicy(broken).join('\n');
  assert.ok(errors.includes('non-test email domain'));
  assert.ok(errors.includes('allowed prefix'));
  assert.ok(errors.includes("start with 'Fixture' or 'Test'"));
  assert.ok(errors.includes('all-X placeholder ID'));
});

test('fixture text rejects credentials and real emails', () => {
  const bad = [
    'contact: alice@company.example',
    `token: sk_live_${'a'.repeat(30)}`,
    'jwt: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    `seed: ${syntheticStellarSecret(0x42)}`,
    'address: 42 Baker Street',
  ].join('\n');

  const findings = validateFixtureText(bad, { policy });
  const rules = new Set(findings.map((finding) => finding.rule_id));
  assert.ok(rules.has('real-email'));
  assert.ok(rules.has('stripe-live-key'));
  assert.ok(rules.has('jwt'));
  assert.ok(rules.has('stellar-secret-seed'));
  assert.ok(rules.has('real-address'));
  for (const finding of findings) {
    assert.ok(!String(finding.matched).includes(syntheticStellarSecret(0x42)));
  }
});

test('fixture text accepts documented synthetic identities and placeholders', () => {
  const good = [
    'user: seed_alice@example.test',
    'contract: CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'key: SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'encryption key: 0000000000000000000000000000000000000000000000000000000000000000',
    'content: Fixture confession 1: synthetic content for local tests only.',
  ].join('\n');
  assert.deepEqual(validateFixtureText(good, { policy }), []);
});

test('self-test passes end to end', () => {
  assert.equal(selfTest(), true);
});
