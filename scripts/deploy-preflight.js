#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HEX_32 = /^[a-fA-F0-9]{64}$/;
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function listFiles(relativeDir, predicate = () => true) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir)
    .filter(predicate)
    .map((file) => path.join(relativeDir, file));
}

function env(name) {
  return process.env[name];
}

function optionalEnv(name) {
  const value = env(name);
  return value === undefined || value === '' ? undefined : value;
}

function requireEnv(name, validator, hint) {
  const value = optionalEnv(name);
  if (!value) {
    fail(`${name} is required. ${hint || ''}`.trim());
    return;
  }
  if (validator && !validator(value)) {
    fail(`${name} is invalid. ${hint || ''}`.trim());
  }
}

function validateFrontendUrls() {
  const backendApi = optionalEnv('BACKEND_API_URL');
  const publicApi = optionalEnv('NEXT_PUBLIC_API_URL');
  const frontendUrl = optionalEnv('FRONTEND_URL') || optionalEnv('VERCEL_PROJECT_PRODUCTION_URL');

  if (backendApi) {
    try {
      const backend = new URL(backendApi);
      const frontendHost = frontendUrl ? new URL(frontendUrl.startsWith('http') ? frontendUrl : `https://${frontendUrl}`).host : undefined;
      if (frontendHost && backend.host === frontendHost) {
        fail('BACKEND_API_URL points to the frontend host. It must point to the Render backend API.');
      }
    } catch {
      fail('BACKEND_API_URL must be a valid URL.');
    }
  }

  if (publicApi) {
    try {
      const publicUrl = new URL(publicApi);
      if (!publicUrl.pathname.replace(/\/+$/, '').endsWith('/api')) {
        fail('NEXT_PUBLIC_API_URL must include the /api backend prefix.');
      }
    } catch {
      fail('NEXT_PUBLIC_API_URL must be a valid URL.');
    }
  }
}

function validateProductionSecrets() {
  const nodeEnv = (env('NODE_ENV') || '').toLowerCase();
  const appEnv = (env('APP_ENV') || '').toLowerCase();
  const isProdLike = ['production', 'staging'].includes(nodeEnv) || ['production', 'staging'].includes(appEnv);
  if (!isProdLike) return;

  requireEnv('JWT_SECRET', (value) => value.length >= 32, 'Generate with: openssl rand -base64 48');
  requireEnv('APP_SECRET', (value) => value.length >= 32, 'Generate with: openssl rand -base64 48');
  requireEnv('CONFESSION_ENCRYPTION_KEY', (value) => HEX_32.test(value) && !/^0+$/.test(value), 'Generate with: openssl rand -hex 32');
  requireEnv('ENCRYPTION_MASTER_KEY_v1', (value) => HEX_32.test(value) && !/^0+$/.test(value), 'Generate with: openssl rand -hex 32');

  if (TRUE_VALUES.has(String(env('TYPEORM_SYNCHRONIZE') || '').toLowerCase())) {
    fail('TYPEORM_SYNCHRONIZE must be false in production-like environments.');
  }
  if (!TRUE_VALUES.has(String(env('TYPEORM_MIGRATIONS_RUN') || '').toLowerCase())) {
    fail('TYPEORM_MIGRATIONS_RUN must be true in production-like environments.');
  }
}

function validateStellarConfig() {
  const enabled = TRUE_VALUES.has(String(env('STELLAR_FEATURES_ENABLED') || '').toLowerCase());
  if (!enabled) return;

  requireEnv('STELLAR_NETWORK', (value) => ['testnet', 'mainnet'].includes(value), 'Use testnet or mainnet.');
  requireEnv('STELLAR_HORIZON_URL', (value) => {
    try { new URL(value); return true; } catch { return false; }
  });
  requireEnv('STELLAR_SOROBAN_RPC_URL', (value) => {
    try { new URL(value); return true; } catch { return false; }
  });
  requireEnv('CONFESSION_ANCHOR_CONTRACT_ID', (value) => CONTRACT_ID.test(value));
  requireEnv('REPUTATION_BADGES_CONTRACT_ID', (value) => CONTRACT_ID.test(value));
  requireEnv('TIPPING_SYSTEM_CONTRACT_ID', (value) => CONTRACT_ID.test(value));
}

function validateMigrations() {
  const migrationFiles = [
    ...listFiles('xconfess-backend/migrations', (file) => /^[0-9].*\.(ts|js)$/.test(file)),
    ...listFiles('xconfess-backend/src/migrations', (file) => /^[0-9].*\.(ts|js)$/.test(file)),
  ];

  const timestamps = new Map();
  for (const relativePath of migrationFiles) {
    const file = path.basename(relativePath);
    const text = readText(relativePath);
    const nameMatch = text.match(/name\s*=\s*['"][A-Za-z0-9_]+?(\d{13,14})['"]/);
    const classMatch = text.match(/class\s+[A-Za-z0-9_]+?(\d{13,14})\s+implements\s+MigrationInterface/);
    const fileMatch = file.match(/^(\d{8}|\d{13,14})/);
    const rawTimestamp = nameMatch?.[1] || classMatch?.[1] || fileMatch?.[1];
    if (!rawTimestamp) {
      fail(`${relativePath} must expose a migration timestamp in the class/name or filename.`);
      continue;
    }
    const timestamp = rawTimestamp.slice(-13);
    const previous = timestamps.get(timestamp);
    if (previous) {
      fail(`Duplicate migration timestamp ${timestamp}: ${previous} and ${relativePath}.`);
    }
    timestamps.set(timestamp, relativePath);
  }
}

function validateWorkspaceDependencies() {
  const rootPackage = readJson('package.json');
  const frontendPackage = readJson('xconfess-frontend/package.json');
  const requiredFrontendDeps = ['@stellar/freighter-api', '@stellar/stellar-sdk'];

  for (const dep of requiredFrontendDeps) {
    if (!frontendPackage.dependencies?.[dep] && !rootPackage.dependencies?.[dep]) {
      fail(`Missing frontend dependency ${dep}.`);
    }
  }
}

function validateRenderYaml() {
  const renderYaml = readText('render.yaml');
  if (/TYPEORM_SYNCHRONIZE\s*\r?\n\s*value:\s*true/.test(renderYaml)) {
    fail('render.yaml enables TYPEORM_SYNCHRONIZE. Production deploys must use migrations.');
  }
  if (!/healthCheckPath:\s*\/api\/health\/live/.test(renderYaml)) {
    fail('render.yaml healthCheckPath must use /api/health/live.');
  }
}

const failures = [];
validateWorkspaceDependencies();
validateRenderYaml();
validateMigrations();
validateFrontendUrls();
validateProductionSecrets();
validateStellarConfig();

if (failures.length > 0) {
  console.error('Deploy preflight failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Deploy preflight passed.');
