#!/usr/bin/env node
'use strict';

/**
 * Fixture validation tool.
 *
 * Enforces the committed synthetic-identity policy so contributors can create
 * realistic backend, frontend, and contract fixtures without committing real
 * credentials or personal data. Dependency-free for CI use.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { findSecrets, loadAllowedValues, syntheticStellarSecret } = require('./lib/secret-patterns');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'scripts', 'fixtures', 'synthetic-identities.json');
const FIXTURES_DIR = path.join(ROOT, 'scripts', 'fixtures');

function loadPolicy(filePath = POLICY_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function emailDomain(email) {
  return String(email).toLowerCase().split('@')[1] || '';
}

function validatePolicy(policy) {
  const errors = [];
  if (policy?.version !== 1) errors.push('version must be 1.');
  const domains = Array.isArray(policy?.allowed_email_domains) ? policy.allowed_email_domains : [];
  const prefixes = Array.isArray(policy?.username_prefixes) ? policy.username_prefixes : [];

  if (domains.length === 0) errors.push('allowed_email_domains must not be empty.');
  if (prefixes.length === 0) errors.push('username_prefixes must not be empty.');

  for (const user of Array.isArray(policy?.synthetic_users) ? policy.synthetic_users : []) {
    if (!prefixes.some((prefix) => String(user.username || '').startsWith(prefix))) {
      errors.push(`synthetic user '${user.username}' must start with an allowed prefix: ${prefixes.join(', ')}.`);
    }
    if (!domains.includes(emailDomain(user.email))) {
      errors.push(`synthetic user '${user.username}' uses a non-test email domain: ${user.email}.`);
    }
    if (!/^Fixture\b|^Test\b/.test(String(user.display_name || ''))) {
      errors.push(`synthetic user '${user.username}' display_name must start with 'Fixture' or 'Test'.`);
    }
  }

  for (const contract of Array.isArray(policy?.synthetic_contracts) ? policy.synthetic_contracts : []) {
    if (!/^[CG]X{55}$/.test(String(contract.contract_id || ''))) {
      errors.push(`synthetic contract '${contract.name}' must use an all-X placeholder ID.`);
    }
  }

  const allowedValues = new Set();
  for (const value of Array.isArray(policy?.allowed_placeholder_values) ? policy.allowed_placeholder_values : []) {
    allowedValues.add(value);
    if (findSecrets(value, { allowedValues: new Set() }).length > 0) {
      errors.push(`allowed_placeholder_values entry looks like a real secret: ${String(value).slice(0, 12)}...`);
    }
  }
  if (allowedValues.size === 0) errors.push('allowed_placeholder_values must not be empty.');

  for (const rule of Array.isArray(policy?.prohibited_patterns) ? policy.prohibited_patterns : []) {
    if (!rule.id || !rule.pattern || !rule.guidance) {
      errors.push('each prohibited_pattern must define id, pattern, and guidance.');
      continue;
    }
    try {
      new RegExp(rule.pattern, 'gi');
    } catch (error) {
      errors.push(`prohibited pattern '${rule.id}' is invalid: ${error.message}`);
    }
  }
  return errors;
}

function validateText(text, { policy, source = '<text>' } = {}) {
  if (!policy) throw new Error('A fixture policy is required.');
  const allowedValues = loadAllowedValues(policy);
  const findings = findSecrets(text, { allowedValues }).map((finding) => ({ ...finding, source }));
  const domains = Array.isArray(policy.allowed_email_domains) ? policy.allowed_email_domains : [];

  const emailRule = (policy.prohibited_patterns || []).find((rule) => rule.id === 'real-email');
  if (emailRule) {
    const regex = new RegExp(emailRule.pattern, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (domains.includes(emailDomain(match[0]))) continue;
      findings.push({
        rule_id: 'real-email',
        rule_name: 'Non-synthetic email address',
        matched: `${match[0].slice(0, 3)}@...`,
        remediation: emailRule.guidance,
        source,
      });
    }
  }

  const addressRule = (policy.prohibited_patterns || []).find((rule) => rule.id === 'real-address');
  if (addressRule) {
    const regex = new RegExp(addressRule.pattern, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        rule_id: 'real-address',
        rule_name: 'Realistic postal address',
        matched: String(match[0]).slice(0, 12),
        remediation: addressRule.guidance,
        source,
      });
    }
  }
  return findings;
}

function listFixtureFiles(files) {
  if (files.length > 0) return files.map((file) => path.resolve(file));
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== path.basename(POLICY_PATH))
    .map((entry) => path.join(FIXTURES_DIR, entry.name));
}

function validateAll({ policyPath = POLICY_PATH, files = [] } = {}) {
  const policy = loadPolicy(policyPath);
  const errors = validatePolicy(policy).map((message) => ({
    rule_id: 'policy',
    rule_name: 'Synthetic identity policy',
    matched: '',
    remediation: message,
    source: path.relative(ROOT, policyPath),
  }));
  const findings = [...errors];

  for (const file of listFixtureFiles(files)) {
    if (!fs.existsSync(file)) {
      findings.push({
        rule_id: 'missing-file',
        rule_name: 'Fixture file',
        matched: '',
        remediation: `Fixture file does not exist: ${file}`,
        source: path.relative(ROOT, file),
      });
      continue;
    }
    findings.push(...validateText(fs.readFileSync(file, 'utf8'), { policy, source: path.relative(ROOT, file) }));
  }
  return { policy, findings };
}

function validateFixtureText(text, options = {}) {
  return validateText(text, { policy: options.policy || loadPolicy(), source: options.source || '<text>' });
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-policy-'));
  try {
    const policy = loadPolicy();
    const goodPath = path.join(dir, 'good.fixture.json');
    const badPath = path.join(dir, 'bad.fixture.json');
    fs.writeFileSync(
      goodPath,
      JSON.stringify({
        username: 'fixture_alice',
        email: 'fixture_alice@example.test',
        contract_id: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        content: 'Fixture confession 1: synthetic content only.',
        key: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    );
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        username: 'fixture_bob',
        email: 'bob@real-company.example',
        secret: `sk_live_${'a'.repeat(30)}`,
        stellar: syntheticStellarSecret(0x2a),
      }),
    );

    const good = validateAll({ files: [goodPath] });
    const bad = validateAll({ files: [badPath] });
    const badRules = new Set(bad.findings.map((finding) => finding.rule_id));

    if (good.findings.length > 0) {
      console.error('  [FAIL] Synthetic fixture was rejected:', good.findings);
      return false;
    }
    if (!badRules.has('real-email') || !badRules.has('stripe-live-key') || !badRules.has('stellar-secret-seed')) {
      console.error('  [FAIL] Prohibited fixture values were not detected:', [...badRules]);
      return false;
    }

    const brokenPolicy = JSON.parse(JSON.stringify(policy));
    brokenPolicy.synthetic_users[0].email = 'alice@real-company.example';
    if (!validatePolicy(brokenPolicy).some((error) => error.includes('non-test email domain'))) {
      console.error('  [FAIL] Policy validator accepted a real email domain.');
      return false;
    }

    console.log('  [OK] Self-test detected prohibited fixture values and accepted synthetic ones.');
    return true;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exitCode = selfTest() ? 0 : 1;
    return;
  }
  const files = args.filter((arg) => arg.startsWith('--file=')).map((arg) => arg.slice('--file='.length));
  const { findings } = validateAll({ files });

  if (findings.length === 0) {
    console.log('Fixture validation passed: identities and fixture files contain only synthetic values.');
    return;
  }
  console.error(`Fixture validation failed with ${findings.length} issue(s):`);
  for (const finding of findings) {
    console.error(`- [${finding.rule_id}] ${finding.source}: ${finding.matched}`);
    console.error(`  ${finding.remediation}`);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  POLICY_PATH,
  loadPolicy,
  validatePolicy,
  validateText,
  validateFixtureText,
  validateAll,
  selfTest,
};
