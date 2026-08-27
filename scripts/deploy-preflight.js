#!/usr/bin/env node
// scripts/deploy-preflight.js
//
// Pre-deployment environment variable validation script for xConfess.
// Validates both backend (.env) and frontend (.env.local) env files.
//
// Usage:
//   npm run deploy:preflight                  # checks both backend and frontend
//   npm run deploy:preflight -- --target backend
//   npm run deploy:preflight -- --target frontend
//
// Exit codes:
//   0 — all checks passed
//   1 — one or more checks failed

'use strict';

const fs = require('fs');
const path = require('path');

// ─── ANSI colours ────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const target = targetIdx !== -1 ? args[targetIdx + 1] : 'both';

if (!['backend', 'frontend', 'both'].includes(target)) {
  console.error(`${RED}Invalid --target value. Must be: backend | frontend | both${RESET}`);
  process.exit(1);
}

// ─── Env file parser (minimal, no external deps) ─────────────────────────────
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

// ─── Check definitions ───────────────────────────────────────────────────────

/**
 * @typedef {{ key: string, required: boolean, label?: string, validate?: (v: string) => string|null }} Check
 */

/** @type {Check[]} */
const BACKEND_CHECKS = [
  // Database
  { key: 'DB_HOST',     required: true  },
  { key: 'DB_PORT',     required: true,  validate: v => /^\d+$/.test(v) ? null : 'must be a number' },
  { key: 'DB_USERNAME', required: true  },
  { key: 'DB_PASSWORD', required: true  },
  { key: 'DB_NAME',     required: true  },
  // Application
  { key: 'PORT',         required: true,  validate: v => /^\d+$/.test(v) ? null : 'must be a number' },
  { key: 'NODE_ENV',     required: false },
  {
    key: 'FRONTEND_URL',
    required: true,
    label: 'FRONTEND_URL ⚠️',
    validate: v => {
      if (v.endsWith('/')) return 'must NOT have a trailing slash';
      if (!v.startsWith('http')) return 'must start with http:// or https://';
      if (process.env.NODE_ENV === 'production' && !v.startsWith('https://')) {
        return 'must use https:// in production';
      }
      return null;
    },
  },
  // Security
  {
    key: 'JWT_SECRET',
    required: true,
    validate: v => v.length >= 32 ? null : `must be at least 32 characters (got ${v.length})`,
  },
  {
    key: 'CONFESSION_AES_KEY',
    required: true,
    validate: v => v.length === 32 ? null : `must be EXACTLY 32 characters (got ${v.length})`,
  },
  {
    key: 'EMAIL_ENCRYPTION_KEY',
    required: true,
    validate: v => v.length === 32 ? null : `must be EXACTLY 32 characters (got ${v.length})`,
  },
  // Email (optional)
  { key: 'MAIL_HOST',     required: false },
  { key: 'MAIL_PORT',     required: false, validate: v => !v || /^\d+$/.test(v) ? null : 'must be a number' },
  { key: 'MAIL_SECURE',   required: false, validate: v => !v || v === 'true' || v === 'false' ? null : 'must be "true" or "false"' },
  { key: 'MAIL_USER',     required: false },
  { key: 'MAIL_PASSWORD', required: false },
  { key: 'MAIL_FROM',     required: false, validate: v => !v || v.includes('@') ? null : 'must be a valid email address' },
  // Redis (optional)
  { key: 'REDIS_HOST', required: false },
  { key: 'REDIS_PORT', required: false, validate: v => !v || /^\d+$/.test(v) ? null : 'must be a number' },
  // Stellar (optional)
  { key: 'STELLAR_NETWORK',            required: false, validate: v => !v || ['testnet','mainnet'].includes(v) ? null : 'must be "testnet" or "mainnet"' },
  { key: 'STELLAR_HORIZON_URL',        required: false, validate: v => !v || v.startsWith('http') ? null : 'must be a URL' },
  { key: 'STELLAR_SOROBAN_RPC_URL',    required: false, validate: v => !v || v.startsWith('http') ? null : 'must be a URL' },
  { key: 'STELLAR_NETWORK_PASSPHRASE', required: false },
  {
    key: 'CONFESSION_ANCHOR_CONTRACT',
    required: false,
    validate: v => {
      if (!v) return null;
      if (!v.startsWith('C')) return 'Stellar contract IDs must start with "C"';
      if (v.length !== 56) return `must be exactly 56 characters (got ${v.length})`;
      return null;
    },
  },
];

/** @type {Check[]} */
const FRONTEND_CHECKS = [
  {
    key: 'NEXT_PUBLIC_API_URL',
    required: true,
    label: 'NEXT_PUBLIC_API_URL ⚠️',
    validate: v => {
      if (v.endsWith('/')) return 'must NOT have a trailing slash';
      if (!v.startsWith('http')) return 'must start with http:// or https://';
      if (process.env.NODE_ENV === 'production' && !v.startsWith('https://')) {
        return 'must use https:// in production';
      }
      return null;
    },
  },
  { key: 'NEXT_PUBLIC_WS_URL', required: false, validate: v => !v || v.startsWith('ws') ? null : 'must start with ws:// or wss://' },
  // Stellar (optional)
  { key: 'NEXT_PUBLIC_STELLAR_NETWORK',         required: false, validate: v => !v || ['testnet','mainnet'].includes(v) ? null : 'must be "testnet" or "mainnet"' },
  { key: 'NEXT_PUBLIC_STELLAR_HORIZON_URL',     required: false, validate: v => !v || v.startsWith('http') ? null : 'must be a URL' },
  { key: 'NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL', required: false, validate: v => !v || v.startsWith('http') ? null : 'must be a URL' },
  {
    key: 'NEXT_PUBLIC_STELLAR_CONTRACT_ID',
    required: false,
    validate: v => {
      if (!v) return null;
      if (!v.startsWith('C')) return 'Stellar contract IDs must start with "C"';
      if (v.length !== 56) return `must be exactly 56 characters (got ${v.length})`;
      return null;
    },
  },
  { key: 'NEXT_PUBLIC_NETWORK_PASSPHRASE', required: false },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
let totalPassed = 0;
let totalFailed = 0;

/**
 * Validates a set of checks against parsed env vars.
 * @param {string} label - Section label to print
 * @param {Record<string,string>|null} env - Parsed env vars (null = file missing)
 * @param {Check[]} checks
 * @param {string} filePath
 */
function runChecks(label, env, checks, filePath) {
  console.log(`\n${BOLD}${CYAN}${label}${RESET}  ${YELLOW}(${filePath})${RESET}`);
  console.log('─'.repeat(60));

  if (env === null) {
    console.log(`  ${RED}✗ File not found: ${filePath}${RESET}`);
    console.log(`  ${YELLOW}  → Copy the .sample file and fill in values.${RESET}`);
    totalFailed++;
    return;
  }

  for (const check of checks) {
    const displayKey = check.label || check.key;
    const value = env[check.key];
    const missing = value === undefined || value === '';
    const isPlaceholder = value && (value.startsWith('CHANGE_ME') || value === 'your_db_username' || value === 'your_db_password' || value === 'your_db_host' || value === 'your_db_port' || value === 'your_jwt_secret');

    if (missing) {
      if (check.required) {
        console.log(`  ${RED}✗ ${displayKey}${RESET} — ${RED}MISSING (required)${RESET}`);
        totalFailed++;
      } else {
        console.log(`  ${YELLOW}○ ${displayKey}${RESET} — not set (optional)`);
      }
      continue;
    }

    if (isPlaceholder) {
      console.log(`  ${RED}✗ ${displayKey}${RESET} — ${RED}placeholder value not replaced${RESET}`);
      totalFailed++;
      continue;
    }

    if (check.validate) {
      const err = check.validate(value);
      if (err) {
        console.log(`  ${RED}✗ ${displayKey}${RESET} — ${RED}${err}${RESET}`);
        totalFailed++;
        continue;
      }
    }

    // Extra info annotations
    let annotation = '';
    if (check.key === 'CONFESSION_AES_KEY' || check.key === 'EMAIL_ENCRYPTION_KEY') {
      annotation = ` (${value.length} chars ✓)`;
    }
    if (check.key === 'JWT_SECRET') {
      annotation = ` (${value.length} chars ✓)`;
    }
    console.log(`  ${GREEN}✅ ${displayKey}${annotation}${RESET}`);
    totalPassed++;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}xConfess Deploy Preflight Check${RESET}`);
console.log('='.repeat(60));

if (target === 'backend' || target === 'both') {
  const backendEnvPath = path.join(ROOT, 'xconfess-backend', '.env');
  const backendEnv = parseEnvFile(backendEnvPath);
  runChecks('Backend (Render)', backendEnv, BACKEND_CHECKS, 'xconfess-backend/.env');
}

if (target === 'frontend' || target === 'both') {
  const frontendEnvPath = path.join(ROOT, 'xconfess-frontend', '.env.local');
  const frontendEnv = parseEnvFile(frontendEnvPath);
  runChecks('Frontend (Vercel)', frontendEnv, FRONTEND_CHECKS, 'xconfess-frontend/.env.local');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`${BOLD}Results:${RESET} ${GREEN}${totalPassed} passed${RESET}  ${totalFailed > 0 ? RED : GREEN}${totalFailed} failed${RESET}`);

if (totalFailed > 0) {
  console.log(`\n${RED}${BOLD}✗ Preflight failed.${RESET} Fix the issues above before deploying.`);
  console.log(`${YELLOW}  → See docs/deployment-env-checklist.md for help.${RESET}\n`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}✅ All checks passed. Safe to deploy! 🚀${RESET}\n`);
  process.exit(0);
}
