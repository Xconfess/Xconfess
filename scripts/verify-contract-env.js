#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { validateNetworkConfiguration } = require('./network-config');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DEPLOYMENT_FILE = path.join(ROOT, 'deployments', 'testnet.json');
const DEFAULT_TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;
const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const REQUIRED_CONTRACT_NAMES = [
  'confession-anchor',
  'confession-registry',
  'anonymous-tipping',
  'reputation-badges',
];
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const NETWORK_ALIAS_REGEX = /^[a-z][a-z0-9-]*$/;
// Template and example values must never reach a release workflow, e.g.
// "<stellar-network-alias>", "YYYY-MM-DDTHH:MM:SSZ", or a "CXXXXXXXX..." ID.
const PLACEHOLDER_REGEX = /<[^>]*>|\bYYYY\b|X{6,}|\bplaceholder\b|\bTODO\b/i;
// Real SHA-256 digests and Stellar contract IDs use many distinct characters.
// Values such as "0000...0001" use only a couple and are rejected.
const MIN_DISTINCT_CHARS = 8;

function isPlaceholderValue(value) {
  return typeof value === 'string' && PLACEHOLDER_REGEX.test(value);
}

function hasLowEntropy(value) {
  return new Set(String(value).toLowerCase()).size < MIN_DISTINCT_CHARS;
}

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
  } else if (isPlaceholderValue(data.network) || !NETWORK_ALIAS_REGEX.test(data.network)) {
    errors.push(
      `"network" must be a Stellar CLI network alias (lowercase letters, digits, hyphens); got "${data.network}".`,
    );
  }

  if (data.target !== undefined && (typeof data.target !== 'string' || isPlaceholderValue(data.target))) {
    errors.push('"target" must be a concrete build target string when present.');
  }

  if (!data.generated_at_utc || typeof data.generated_at_utc !== 'string') {
    errors.push('Metadata missing "generated_at_utc" timestamp string.');
  } else if (isNaN(Date.parse(data.generated_at_utc))) {
    errors.push('"generated_at_utc" must be a valid ISO 8601 UTC date string.');
  }

  if (!data.contracts || typeof data.contracts !== 'object' || Object.keys(data.contracts).length === 0) {
    errors.push('Metadata missing valid non-empty "contracts" dictionary.');
  } else {
    for (const required of REQUIRED_CONTRACT_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(data.contracts, required)) {
        errors.push(`Metadata is missing required contract entry "${required}".`);
      }
    }

    for (const name of Object.keys(data.contracts)) {
      if (!REQUIRED_CONTRACT_NAMES.includes(name)) {
        errors.push(`Unexpected contract entry "${name}"; expected only: ${REQUIRED_CONTRACT_NAMES.join(', ')}.`);
      }
    }

    for (const [name, contract] of Object.entries(data.contracts)) {
      if (!contract || typeof contract !== 'object') {
        errors.push(`Contract entry "${name}" must be an object.`);
        continue;
      }

      if (!contract.contract_id || !CONTRACT_ID_REGEX.test(contract.contract_id)) {
        errors.push(`Contract "${name}" has missing or invalid "contract_id" (must match ^C[A-Z2-7]{55}$).`);
      } else if (isPlaceholderValue(contract.contract_id) || hasLowEntropy(contract.contract_id)) {
        errors.push(`Contract "${name}" has a placeholder "contract_id"; record the deployed contract's real ID.`);
      }

      if (!contract.sha256 || !SHA256_REGEX.test(contract.sha256)) {
        errors.push(`Contract "${name}" has missing or invalid "sha256" (must be a 64-char hex string).`);
      } else if (hasLowEntropy(contract.sha256)) {
        errors.push(`Contract "${name}" has a placeholder "sha256"; record the digest of the release WASM.`);
      }

      if (!contract.wasm_file || typeof contract.wasm_file !== 'string' || !contract.wasm_file.endsWith('.wasm')) {
        errors.push(`Contract "${name}" must have a valid "wasm_file" path ending with .wasm.`);
      } else if (isPlaceholderValue(contract.wasm_file)) {
        errors.push(`Contract "${name}" has a placeholder "wasm_file" path.`);
      } else {
        const expectedFile = `${name.replace(/-/g, '_')}.wasm`;
        const fileName = contract.wasm_file.split('/').pop();
        if (fileName !== expectedFile || !contract.wasm_file.includes('/release/')) {
          errors.push(`Contract "${name}" wasm_file must be a release artifact named "${expectedFile}" (got "${contract.wasm_file}").`);
        }
      }

      if (!contract.version || typeof contract.version !== 'string') {
        errors.push(`Contract "${name}" must have a valid "version" string.`);
      } else if (!SEMVER_REGEX.test(contract.version)) {
        errors.push(`Contract "${name}" version must be MAJOR.MINOR.PATCH; got "${contract.version}".`);
      }

      if (!contract.source || typeof contract.source !== 'string') {
        errors.push(`Contract "${name}" must have a valid "source" string.`);
      } else if (isPlaceholderValue(contract.source)) {
        errors.push(`Contract "${name}" has a placeholder "source" key alias.`);
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

function isTruthy(value) {
  return TRUE_VALUES.has(String(value || '').toLowerCase());
}

function derivePublicKeyFromSecret(secret) {
  try {
    const { Keypair } = require('@stellar/stellar-sdk');
    return { publicKey: Keypair.fromSecret(secret).publicKey() };
  } catch (error) {
    return {
      error:
        'STELLAR_SERVER_SECRET is not a valid Stellar secret seed. Generate or configure a funded signer for the selected network.',
    };
  }
}

async function checkHorizonTestnetAccount(publicKey, horizonUrl) {
  if (typeof fetch !== 'function') {
    return {
      warning:
        `Could not verify signer account ${publicKey}: this Node runtime does not provide fetch. ` +
        'Confirm the account is funded on Stellar testnet before deploy.',
    };
  }

  const baseUrl = horizonUrl || DEFAULT_TESTNET_HORIZON_URL;

  try {
    const accountUrl = new URL(`/accounts/${publicKey}`, baseUrl);
    const response = await fetch(accountUrl, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404) {
      return {
        warning:
          `STELLAR_SERVER_SECRET resolves to ${publicKey}, but that account does not exist or is unfunded on Stellar testnet. ` +
          `Fund it with Friendbot: https://friendbot.stellar.org?addr=${publicKey}`,
      };
    }

    if (!response.ok) {
      return {
        warning:
          `Could not verify signer account ${publicKey} on Stellar testnet Horizon (${baseUrl}); Horizon returned HTTP ${response.status}. ` +
          'Confirm the signer is funded on the intended network before deploy.',
      };
    }

    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      warning:
        `Could not verify signer account ${publicKey} on Stellar testnet Horizon (${baseUrl}): ${message}. ` +
        'Confirm the signer is funded on the intended network before deploy.',
    };
  }
}

async function collectStellarSignerDiagnostics(rawData) {
  const warnings = [];
  const failures = [];

  if (!isTruthy(process.env.STELLAR_FEATURES_ENABLED)) {
    return { warnings, failures };
  }

  const secret = process.env.STELLAR_SERVER_SECRET;
  if (!secret) {
    warnings.push(
      'STELLAR_SERVER_SECRET is not set; configure a funded Stellar testnet signer before enabling on-chain writes.',
    );
    return { warnings, failures };
  }

  const derived = derivePublicKeyFromSecret(secret);
  if (derived.error) {
    failures.push(derived.error);
    return { warnings, failures };
  }

  const network = String(process.env.STELLAR_NETWORK || rawData.network || 'testnet').toLowerCase();
  if (network === 'testnet') {
    const accountCheck = await checkHorizonTestnetAccount(
      derived.publicKey,
      process.env.STELLAR_HORIZON_URL || DEFAULT_TESTNET_HORIZON_URL,
    );
    if (accountCheck.warning) warnings.push(accountCheck.warning);
  }

  return { warnings, failures };
}

async function main() {
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
  const stellarFeaturesEnabled = isTruthy(process.env.STELLAR_FEATURES_ENABLED);
  const configuredNetwork = process.env.STELLAR_NETWORK;

  if (configuredNetwork || process.env.STELLAR_HORIZON_URL || process.env.STELLAR_SOROBAN_RPC_URL) {
    failures.push(
      ...validateNetworkConfiguration({
        network: configuredNetwork || rawData.network,
        deploymentNetwork: rawData.network,
        horizonUrl: process.env.STELLAR_HORIZON_URL,
        sorobanRpcUrl: process.env.STELLAR_SOROBAN_RPC_URL,
      }).map((failure) => failure.replace('deployment metadata network', `${path.relative(ROOT, deploymentFile)} network`)),
    );
  }

  for (const name of [
    'CONFESSION_ANCHOR_CONTRACT_ID',
    'REPUTATION_BADGES_CONTRACT_ID',
    'TIPPING_SYSTEM_CONTRACT_ID',
  ]) {
    const configured = process.env[name];
    if (!configured) {
      if (stellarFeaturesEnabled) {
        failures.push(
          `${name} is required when STELLAR_FEATURES_ENABLED=true so it can be compared with ${path.relative(ROOT, deploymentFile)}.`,
        );
      }
      continue;
    }
    if (!CONTRACT_ID_REGEX.test(configured)) {
      failures.push(`${name} is not a valid Stellar contract ID.`);
    }
    if (expected[name] && expected[name] !== configured) {
      failures.push(`${name} does not match ${path.relative(ROOT, deploymentFile)}.`);
    }
  }

  const signerDiagnostics = await collectStellarSignerDiagnostics(rawData);
  failures.push(...signerDiagnostics.failures);

  if (failures.length > 0) {
    console.error('Contract environment verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    if (signerDiagnostics.warnings.length > 0) {
      console.warn('Contract environment warnings:');
      for (const warning of signerDiagnostics.warnings) console.warn(`- ${warning}`);
    }
    process.exit(1);
  }

  if (signerDiagnostics.warnings.length > 0) {
    console.warn('Contract environment warnings:');
    for (const warning of signerDiagnostics.warnings) console.warn(`- ${warning}`);
  }

  console.log(`Contract deployment metadata & environment verification passed (${rawData.network}).`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Contract environment verification failed: ${message}`);
    process.exit(1);
  });
}

module.exports = {
  validateDeploymentMetadataSchema,
  readDeploymentIds,
  readDeploymentData,
  derivePublicKeyFromSecret,
  checkHorizonTestnetAccount,
  validateNetworkConfiguration,
};
