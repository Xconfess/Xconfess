#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'distribution-policy.json'), 'utf8'));

function normalizeLicense(value) {
  if (!value) return 'UNKNOWN';
  if (typeof value !== 'string') return 'UNKNOWN';
  const text = value.replace(/[()]/g, '').replace(/\s+OR\s+/gi, ' OR ').trim();
  return text;
}

function classifyLicense(value) {
  const license = normalizeLicense(value);
  if (/\bOR\b/i.test(license)) {
    const choices = license.split(/\bOR\b/i).map((choice) => choice.trim());
    if (choices.length && choices.every((choice) => POLICY.allowedLicenses.includes(normalizeLicense(choice)))) return 'allowed';
  }
  if (POLICY.allowedLicenses.includes(license)) return 'allowed';
  if (POLICY.reviewRequiredLicenses.includes(license) || POLICY.reviewRequiredPatterns.some((pattern) => license.includes(pattern))) return 'review-required';
  return 'review-required';
}

function npmPackages() {
  const packages = [];
  const rootLock = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(rootLock)) {
    const lock = JSON.parse(fs.readFileSync(rootLock, 'utf8'));
    for (const [key, entry] of Object.entries(lock.packages || {})) {
      if (!key || !entry || key.endsWith('/node_modules/')) continue;
      const name = entry.name || key.split('node_modules/').pop();
      if (!name || name === 'xconfess') continue;
      packages.push({ ecosystem: 'npm', name, version: entry.version || 'unknown', license: normalizeLicense(entry.license), workspace: key });
    }
  }
  const unique = new Map();
  for (const pkg of packages) unique.set(`${pkg.name}@${pkg.version}`, pkg);
  return [...unique.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

function rustPackages() {
  const cargo = path.join(ROOT, 'xconfess-contracts', 'Cargo.toml');
  if (!fs.existsSync(cargo)) return [];
  let metadata;
  try {
    metadata = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path', cargo, '--format-version', '1', '--locked'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    throw new Error(`Rust license audit could not run cargo metadata: ${error.message}`);
  }
  const memberIds = new Set(metadata.workspace_members);
  const packages = [];
  for (const pkg of metadata.packages || []) {
    if (memberIds.has(pkg.id)) continue;
    packages.push({ ecosystem: 'cargo', name: pkg.name, version: pkg.version, license: normalizeLicense(pkg.license), workspace: 'xconfess-contracts' });
  }
  const unique = new Map();
  for (const pkg of packages) unique.set(`${pkg.name}@${pkg.version}`, pkg);
  return [...unique.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

function audit({ includeRust = true } = {}) {
  const packages = npmPackages().concat(includeRust ? rustPackages() : []);
  const findings = packages.map((pkg) => ({ ...pkg, status: classifyLicense(pkg.license) }));
  return {
    policy: POLICY,
    summary: {
      total: findings.length,
      allowed: findings.filter((pkg) => pkg.status === 'allowed').length,
      reviewRequired: findings.filter((pkg) => pkg.status === 'review-required').length,
    },
    packages: findings,
  };
}

function selfTest() {
  const allowed = classifyLicense('MIT') === 'allowed';
  const rejected = classifyLicense('GPL-3.0') === 'review-required';
  if (!allowed || !rejected) throw new Error('license policy fixtures failed');
  console.log('Package distribution policy fixtures: allowed=MIT, rejected=GPL-3.0');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const report = audit();
  const jsonPath = path.join(ROOT, 'package-license-report.json');
  const mdPath = path.join(ROOT, 'PACKAGE_LICENSE_REPORT.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.packages.map((pkg) => `| ${pkg.ecosystem} | ${pkg.name} | ${pkg.version} | ${pkg.license} | ${pkg.status} |`).join('\n');
  fs.writeFileSync(mdPath, `# Package Distribution Report\n\n- Total: ${report.summary.total}\n- Allowed: ${report.summary.allowed}\n- Review required: ${report.summary.reviewRequired}\n\n| Ecosystem | Package | Version | License | Status |\n|---|---|---|---|---|\n${rows}\n`);
  for (const pkg of report.packages.filter((item) => item.status === 'review-required')) {
    console.error(`REVIEW REQUIRED: ${pkg.ecosystem} ${pkg.name}@${pkg.version} license=${pkg.license}`);
  }
  console.log(`Package distribution report: ${report.summary.allowed} allowed, ${report.summary.reviewRequired} review-required`);
  if (process.argv.includes('--fail-on-review') && report.summary.reviewRequired) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { audit, classifyLicense, normalizeLicense, npmPackages, rustPackages };
