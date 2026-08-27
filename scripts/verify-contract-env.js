#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DEPLOYMENT_FILE = path.join(ROOT, 'deployments', 'testnet.json');
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;
const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * Validates the structural shape and schema integrity of deployment metadata (#1738).
 * @param {object} data - Parsed deployment metadata JSON object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDeploymentMetadataSchema(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Deployment metadata must be a non-null object.'] };
  }

  if (!data.network || typeof data.network !== 'string') {
    errors.push('Metadata missing valid "network" string field.');
  }

  if (!data.generated_at_utc || typeof data.generated_at_utc !== 'string') {
    errors.push('Metadata missing "generated_at_utc" timestamp string.');
  } else if (isNaN(Date.parse(data.generated_at_utc))) {
    errors.push('"generated_at_utc" must be a valid ISO 8601 UTC date string.');
  }

  if (!data.contracts || typeof data.contracts !== 'object' || Object.keys(data.contracts).length === 0) {
    errors.push('Metadata missing valid non-empty "contracts" dictionary.');
  } else {
    for (const [name, contract] of Object.entries(data.contracts)) {
      if (!contract || typeof contract !== 'object') {
        errors.push(`Contract entry "${name}" must be an object.`);
        continue;
      }

      if (!contract.contract_id || !CONTRACT_ID_REGEX.test(contract.contract_id)) {
        errors.push(`Contract "${name}" has missing or invalid "contract_id" (must match ^C[A-Z2-7]{55}$).`);
      }

      if (!contract.sha256 || !SHA256_REGEX.test(contract.sha256)) {
        errors.push(`Contract "${name}" has missing or invalid "sha256" (must be a 64-char hex string).`);
      }

      if (!contract.wasm_file || typeof contract.wasm_file !== 'string' || !contract.wasm_file.endsWith('.wasm')) {
        errors.push(`Contract "${name}" must have a valid "wasm_file" path ending with .wasm.`);
      }

      if (!contract.version || typeof contract.version !== 'string') {
        errors.push(`Contract "${name}" must have a valid "version" string.`);
      }

      if (!contract.source || typeof contract.source !== 'string') {
        errors.push(`Contract "${name}" must have a valid "source" string.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function readDeploymentData(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function readDeploymentIds(filePath) {
  const data = readDeploymentData(filePath);
  if (!data) return {};
  const contracts = data.contracts || data;
  return {
    CONFESSION_ANCHOR_CONTRACT_ID:
      contracts['confession-anchor']?.contract_id ||
      contracts.confession_anchor?.contractId ||
      contracts.confessionAnchor?.contractId ||
      contracts.CONFESSION_ANCHOR_CONTRACT_ID,
    REPUTATION_BADGES_CONTRACT_ID:
      contracts['reputation-badges']?.contract_id ||
      contracts.reputation_badges?.contractId ||
      contracts.reputationBadges?.contractId ||
      contracts.REPUTATION_BADGES_CONTRACT_ID,
    TIPPING_SYSTEM_CONTRACT_ID:
      contracts['anonymous-tipping']?.contract_id ||
      contracts.tipping_system?.contractId ||
      contracts.tippingSystem?.contractId ||
      contracts.TIPPING_SYSTEM_CONTRACT_ID,
  };
}

function main() {
  const deploymentFile = process.env.DEPLOYMENT_METADATA_PATH
    ? path.resolve(ROOT, process.env.DEPLOYMENT_METADATA_PATH)
    : DEFAULT_DEPLOYMENT_FILE;

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment metadata file not found at: ${deploymentFile}`);
    process.exit(1);
  }

  const rawData = readDeploymentData(deploymentFile);
  if (!rawData) {
    console.error(`Failed to parse JSON in deployment file: ${deploymentFile}`);
    process.exit(1);
  }

  // Validate metadata schema
  const schemaValidation = validateDeploymentMetadataSchema(rawData);
  if (!schemaValidation.valid) {
    console.error(`Deployment metadata schema validation failed for ${path.relative(ROOT, deploymentFile)}:`);
    for (const err of schemaValidation.errors) console.error(`- ${err}`);
    process.exit(1);
  }

  const expected = readDeploymentIds(deploymentFile);
  const failures = [];

  for (const name of [
    'CONFESSION_ANCHOR_CONTRACT_ID',
    'REPUTATION_BADGES_CONTRACT_ID',
    'TIPPING_SYSTEM_CONTRACT_ID',
  ]) {
    const configured = process.env[name];
    if (!configured) {
      // In standalone schema validation mode or when env vars aren't exported, note schema passed
      continue;
    }
    if (!CONTRACT_ID_REGEX.test(configured)) {
      failures.push(`${name} is not a valid Stellar contract ID.`);
    }
    if (expected[name] && expected[name] !== configured) {
      failures.push(`${name} does not match ${path.relative(ROOT, deploymentFile)}.`);
    }
  }

  if (failures.length > 0) {
    console.error('Contract environment verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Contract deployment metadata & environment verification passed (${rawData.network}).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateDeploymentMetadataSchema,
  readDeploymentIds,
  readDeploymentData,
};

