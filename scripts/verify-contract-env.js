#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DEPLOYMENT_FILE = path.join(ROOT, 'deployments', 'testnet.json');
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

function readDeploymentIds(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  const expected = readDeploymentIds(deploymentFile);
  const failures = [];

  for (const name of [
    'CONFESSION_ANCHOR_CONTRACT_ID',
    'REPUTATION_BADGES_CONTRACT_ID',
    'TIPPING_SYSTEM_CONTRACT_ID',
  ]) {
    const configured = process.env[name];
    if (!configured) {
      failures.push(`${name} is missing from the environment.`);
      continue;
    }
    if (!CONTRACT_ID.test(configured)) {
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

  console.log('Contract environment verification passed.');
}

main();
