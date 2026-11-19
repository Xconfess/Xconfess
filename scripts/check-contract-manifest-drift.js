#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ABI = path.join(ROOT, 'deployments', 'contract-abi-manifest.json');
const WASM = path.join(ROOT, 'deployments', 'contract-wasm-manifest.json');
const TESTNET = path.join(ROOT, 'deployments', 'testnet.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cargoContractNames() {
  const cargoPath = path.join(ROOT, 'xconfess-contracts', 'Cargo.toml');
  const cargo = fs.readFileSync(cargoPath, 'utf8');
  const membersBlock = cargo.match(/members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
  return [...membersBlock.matchAll(/"contracts\/([^"/]+)"/g)].map((match) => match[1]);
}

function validate({ abiManifest, wasmManifest, testnetManifest, contractNames = cargoContractNames() }) {
  const errors = [];
  const abi = abiManifest?.contracts;
  const wasm = wasmManifest?.contracts;
  const testnet = testnetManifest?.contracts;
  for (const name of contractNames) {
    const abiEntry = abi?.[name];
    const wasmEntry = wasm?.[name];
    const testnetEntry = testnet?.[name];
    if (!abiEntry) errors.push(`Missing ABI manifest contract: ${name}`);
    if (!wasmEntry) errors.push(`Missing WASM manifest contract: ${name}`);
    if (!testnetEntry) errors.push(`Missing testnet deployment contract ID for: ${name}`);

    const cargoPath = path.join(ROOT, 'xconfess-contracts', 'contracts', name, 'Cargo.toml');
    if (!fs.existsSync(cargoPath)) {
      errors.push(`Missing workspace contract Cargo.toml: ${name}`);
      continue;
    }
    const cargo = fs.readFileSync(cargoPath, 'utf8');
    const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const abiJsonPath = path.join(ROOT, 'xconfess-contracts', 'contracts', name, 'abi.json');
    const abiJson = fs.existsSync(abiJsonPath) ? readJson(abiJsonPath) : null;

    for (const [label, entry] of [['ABI', abiEntry], ['WASM', wasmEntry], ['testnet', testnetEntry]]) {
      if (entry && entry.version && cargoVersion && entry.version !== cargoVersion) {
        errors.push(`${name}: ${label} manifest version ${entry.version} differs from Cargo.toml ${cargoVersion}`);
      }
    }
    if (abiJson && abiEntry && abiJson.version !== abiEntry.version) {
      errors.push(`${name}: ABI compatibility file version ${abiJson.version} differs from ABI manifest ${abiEntry.version}`);
    }
    if (abiEntry && wasmEntry && abiEntry.version !== wasmEntry.version) {
      errors.push(`${name}: ABI manifest version ${abiEntry.version} differs from WASM manifest ${wasmEntry.version}`);
    }
    if (wasmEntry && testnetEntry && wasmEntry.sha256 !== testnetEntry.sha256) {
      console.error(`${name}: informational historical hash difference (WASM=${wasmEntry.sha256}, testnet=${testnetEntry.sha256}); deployed IDs are preserved.`);
    }
    if (wasmEntry && testnetEntry && wasmEntry.wasm_file !== testnetEntry.wasm_file) {
      errors.push(`${name}: WASM manifest file ${wasmEntry.wasm_file} differs from testnet ${testnetEntry.wasm_file}`);
    }
    if (testnetEntry && (!testnetEntry.contract_id || !/^C[A-Z2-7]+$/.test(testnetEntry.contract_id))) {
      errors.push(`${name}: invalid or missing testnet contract ID`);
    }
  }

  const sections = { abi, wasm, testnet };
  for (const [label, section] of Object.entries(sections)) {
    const names = section ? Object.keys(section) : [];
    const unexpected = names.filter((name) => !contractNames.includes(name));
    const missing = contractNames.filter((name) => !names.includes(name));
    for (const name of unexpected) errors.push(`${label} manifest has unexpected contract name: ${name}`);
    for (const name of missing) errors.push(`${label} manifest is missing contract name: ${name}`);
  }

  if (testnet) {
    const ids = Object.values(testnet).map((entry) => entry.contract_id).filter(Boolean);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    for (const id of new Set(duplicates)) errors.push(`Duplicate testnet contract ID: ${id}`);
  }
  return errors;
}

function main() {
  const errors = validate({
    abiManifest: readJson(ABI),
    wasmManifest: readJson(WASM),
    testnetManifest: readJson(TESTNET),
  });
  if (errors.length) {
    console.error('Contract manifest drift detected:');
    for (const error of errors) console.error(`- ${error}`);
    console.error('Refresh the ABI, WASM, and testnet manifests together, then rerun: npm run contracts:manifest-check');
    process.exitCode = 1;
  } else {
    console.log('Contract manifest drift check passed: all workspace contracts, names, IDs, and ABI/WASM versions are synchronized.');
  }
}

if (require.main === module) main();
module.exports = { cargoContractNames, validate };
