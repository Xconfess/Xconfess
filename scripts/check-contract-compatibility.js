#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTRACTS_ROOT = path.join(ROOT, 'xconfess-contracts', 'contracts');
const ABI_MANIFEST = path.join(ROOT, 'deployments', 'contract-abi-manifest.json');
const RELEASE_CONTRACTS = [
  'confession-anchor',
  'confession-registry',
  'anonymous-tipping',
  'reputation-badges',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateContractCompatibility({ manifest, abiByContract, releaseContracts = RELEASE_CONTRACTS }) {
  const errors = [];
  const manifestContracts = manifest?.contracts;

  if (!manifest || typeof manifest !== 'object' || !manifestContracts || typeof manifestContracts !== 'object') {
    return ['ABI compatibility manifest must contain a contracts object.'];
  }

  for (const name of releaseContracts) {
    const expected = manifestContracts[name];
    const actual = abiByContract[name];

    if (!expected) {
      errors.push(`Missing ABI compatibility entry for ${name}.`);
      continue;
    }
    if (!actual) {
      errors.push(`Missing runtime ABI marker for ${name}.`);
      continue;
    }

    for (const field of ['version', 'event_schema_version', 'error_registry_version']) {
      if (expected[field] !== actual[field]) {
        errors.push(
          `${name}: ${field} mismatch (manifest=${JSON.stringify(expected[field])}, runtime=${JSON.stringify(actual[field])}).`,
        );
      }
    }

    if (!Array.isArray(expected.functions) || !expected.functions.every((value) => typeof value === 'string')) {
      errors.push(`${name}: manifest functions must be an array of strings.`);
    } else if (!Array.isArray(actual.functions)) {
      errors.push(`${name}: runtime ABI functions must be an array.`);
    } else {
      const runtimeFunctions = new Set(actual.functions);
      for (const functionName of expected.functions) {
        if (!runtimeFunctions.has(functionName)) {
          errors.push(`${name}: compatibility function ${functionName} is missing from runtime ABI.`);
        }
      }
    }

    const cargoPath = path.join(CONTRACTS_ROOT, name, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const cargo = fs.readFileSync(cargoPath, 'utf8');
      const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      if (version && version !== expected.version) {
        errors.push(`${name}: Cargo.toml version ${version} does not match ABI manifest ${expected.version}.`);
      }
    } else {
      errors.push(`${name}: contract Cargo.toml is missing.`);
    }
  }

  for (const name of Object.keys(manifestContracts)) {
    if (!releaseContracts.includes(name)) errors.push(`Unexpected ABI compatibility entry for ${name}.`);
  }

  return errors;
}

function loadCompatibilityInputs() {
  const manifest = readJson(ABI_MANIFEST);
  const abiByContract = {};
  for (const name of RELEASE_CONTRACTS) {
    const filePath = path.join(CONTRACTS_ROOT, name, 'abi.json');
    if (fs.existsSync(filePath)) abiByContract[name] = readJson(filePath);
  }
  return { manifest, abiByContract };
}

function main() {
  const errors = validateContractCompatibility(loadCompatibilityInputs());
  if (errors.length) {
    console.error('Contract upgrade compatibility checklist failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Contract upgrade compatibility checklist passed.');
}

if (require.main === module) main();

module.exports = { RELEASE_CONTRACTS, validateContractCompatibility };
