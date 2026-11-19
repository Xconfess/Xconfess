#!/usr/bin/env node
'use strict';

/**
 * Scan deployable bundles and archives for high-confidence secrets.
 *
 * Coverage: backend dist, frontend build output, Docker build context files,
 * contract release WASM, deployment metadata, and archives. Synthetic values
 * documented in scripts/fixtures/synthetic-identities.json are allowlisted.
 *
 * Usage:
 *   node scripts/scan-artifacts.js [--path=<repo-root>] [--json] [--self-test]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { findSecrets, loadAllowedValues } = require('./lib/secret-patterns');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'scripts', 'fixtures', 'synthetic-identities.json');
const MAX_FILE_BYTES = 64 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  '', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.map', '.html',
  '.css', '.txt', '.yaml', '.yml', '.env', '.md', '.wasm',
]);
const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.gz', '.tgz', '.7z', '.bz2'];
const PRUNED_DIRS = new Set(['.git', 'node_modules', '.cache', 'coverage', 'test-results', 'playwright-report']);

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function exists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function walk(directory, visitor) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!PRUNED_DIRS.has(entry.name)) walk(full, visitor);
    } else if (entry.isFile()) {
      visitor(full);
    }
  }
}

function isArchive(filePath) {
  const lower = filePath.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isWasm(filePath) {
  return filePath.toLowerCase().endsWith('.wasm');
}

/** Collect artifact files relative to a repo root. */
function collectTargets(root) {
  const targets = new Map();

  const addFile = (relative) => {
    const absolute = path.join(root, relative);
    if (exists(absolute) && fs.statSync(absolute).isFile()) targets.set(absolute, relative);
  };
  const addDirectory = (relative) => {
    const absolute = path.join(root, relative);
    walk(absolute, (file) => targets.set(file, path.relative(root, file)));
  };

  // Docker build context and committed release metadata.
  for (const file of ['Dockerfile.backend', 'Dockerfile.frontend', 'compose.yaml', 'render.yaml']) addFile(file);
  addDirectory('deployments');
  addDirectory('scripts/fixtures');

  // Backend, frontend, and contract release artifacts.
  addDirectory('xconfess-backend/dist');
  addDirectory('xconfess-frontend/.next');
  addDirectory('xconfess-frontend/out');
  addDirectory('xconfess-frontend/build');
  addDirectory('xconfess-contracts/target');

  // Environment files that could be copied into a deployable artifact.
  for (const directory of ['xconfess-backend', 'xconfess-frontend', '.']) {
    if (!fs.existsSync(path.join(root, directory))) continue;
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('.env')) continue;
      if (entry.name === '.env.example' || entry.name === '.env.sample') continue;
      addFile(path.join(directory, entry.name));
    }
  }

  // Archives anywhere in the tree (build outputs, tarballs, fixture bundles).
  walk(root, (file) => {
    if (isArchive(file)) targets.set(file, path.relative(root, file));
  });

  return [...targets.entries()]
    .filter(([absolute]) => {
      const name = path.basename(absolute).toLowerCase();
      if (name.startsWith('dockerfile') || name.startsWith('.env')) return true;
      const extension = path.extname(absolute).toLowerCase();
      return TEXT_EXTENSIONS.has(extension) || isArchive(absolute) || isWasm(absolute);
    })
    .map(([absolute, relative]) => ({ absolute, relative }));
}

function scanFile(target, allowedValues) {
  const stats = fs.statSync(target.absolute);
  if (stats.size > MAX_FILE_BYTES) {
    return { skipped: `${target.relative} exceeds ${MAX_FILE_BYTES} bytes`, findings: [] };
  }
  const content = fs.readFileSync(target.absolute);
  const findings = findSecrets(content, { allowedValues }).map((finding) => ({ ...finding, file: target.relative }));
  return { skipped: null, findings };
}

function scanAll(root, policy = loadPolicy()) {
  const allowedValues = loadAllowedValues(policy);
  const targets = collectTargets(root);
  const findings = [];
  const skipped = [];
  for (const target of targets) {
    const result = scanFile(target, allowedValues);
    findings.push(...result.findings);
    if (result.skipped) skipped.push(result.skipped);
  }
  return { findings, skipped, targets: targets.length };
}

function formatFindings(result) {
  const lines = [`Release artifact secret scan: ${result.findings.length} high-confidence finding(s) across ${result.targets} artifact(s).`, ''];
  for (const finding of result.findings) {
    lines.push(`- [${finding.rule_id}] ${finding.file}`);
    lines.push(`    Match: ${finding.matched}`);
    lines.push(`    Fix:   ${finding.remediation}`);
  }
  if (result.skipped.length) {
    lines.push('');
    for (const message of result.skipped) lines.push(`Skipped: ${message}`);
  }
  return lines.join('\n');
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-scan-'));
  try {
    const layout = [
      'xconfess-backend/dist',
      'xconfess-frontend/.next/static/chunks',
      'xconfess-contracts/target/wasm32v1-none/release',
      'deployments',
      'scripts/fixtures',
    ];
    for (const entry of layout) fs.mkdirSync(path.join(dir, entry), { recursive: true });

    // Assemble synthetic secrets at runtime so detection rules never appear as
    // literal credentials in this source file (the repo-wide preflight scans it).
    const syntheticJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'].join('.');
    const syntheticPem = '-----BEGIN ' + 'RSA PRIVATE KEY' + '-----';
    fs.writeFileSync(path.join(dir, 'xconfess-backend/dist/index.js'), `const key = "sk_live_${'b'.repeat(30)}";\n`);
    fs.writeFileSync(
      path.join(dir, 'xconfess-frontend/.next/static/chunks/main.js'),
      `const token = "${syntheticJwt}";\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'xconfess-contracts/target/wasm32v1-none/release/confession_anchor.wasm'),
      `synthetic wasm prefix ${syntheticPem} synthetic wasm suffix`,
    );
    fs.writeFileSync(path.join(dir, 'release-bundle.tar.gz'), `ghp_${'c'.repeat(36)}\n`);
    fs.writeFileSync(
      path.join(dir, 'deployments/synthetic.json'),
      JSON.stringify({ username: 'seed_alice@example.test', key: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' }),
    );

    const result = scanAll(dir);
    const rules = new Set(result.findings.map((finding) => finding.rule_id));
    const expected = ['stripe-live-key', 'jwt', 'private-key-block', 'github-pat'];
    const missing = expected.filter((rule) => !rules.has(rule));
    const allowlistedFlagged = result.findings.filter((finding) => finding.file.includes('synthetic.json'));

    if (missing.length || allowlistedFlagged.length) {
      console.error(`  [FAIL] Artifact scanner self-test failed. Missing: ${missing.join(', ') || 'none'}; allowlisted flagged: ${allowlistedFlagged.length}`);
      return false;
    }
    console.log('  [OK] Artifact scanner detected all synthetic release secrets and ignored allowlisted values.');
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
  const pathArg = args.find((arg) => arg.startsWith('--path='));
  const root = path.resolve(pathArg ? pathArg.slice('--path='.length) : ROOT);
  const result = scanAll(root);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatFindings(result));
  }
  if (result.findings.length > 0) {
    console.error('Release artifact scan FAILED. Remove the finding or add an explicitly documented synthetic placeholder, then rebuild the artifact.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { collectTargets, scanFile, scanAll, formatFindings, selfTest };
