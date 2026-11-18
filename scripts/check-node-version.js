#!/usr/bin/env node

const EXPECTED_NODE_MAJOR = 22;
const MIN_NPM_MAJOR = 9;

function parseMajor(version) {
  const match = String(version || '').match(/(\d+)/);
  return match ? Number(match[1]) : NaN;
}

const nodeVersion = process.env.NODE_VERSION_OVERRIDE || process.version;
const nodeMajor = parseMajor(nodeVersion);
const npmVersion =
  process.env.NPM_VERSION_OVERRIDE ||
  process.env.npm_config_user_agent?.match(/npm\/([0-9.]+)/)?.[1];
const npmMajor = parseMajor(npmVersion);

const failures = [];
if (nodeMajor !== EXPECTED_NODE_MAJOR) {
  failures.push(
    `Node.js ${EXPECTED_NODE_MAJOR}.x is required; current version is ${nodeVersion}.`,
  );
}

if (npmVersion && npmMajor < MIN_NPM_MAJOR) {
  failures.push(`npm ${MIN_NPM_MAJOR}+ is required; current version is ${npmVersion}.`);
}

if (failures.length > 0) {
  console.error('Unsupported local runtime.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('');
  console.error('Recommended fixes:');
  console.error('- nvm install 22 && nvm use 22');
  console.error('- fnm install 22 && fnm use 22');
  console.error('- volta install node@22');
  console.error('- On Windows, use fnm, nvm-windows, or Volta; run npm.cmd if PowerShell blocks npm.ps1');
  process.exit(1);
}

console.log(`Runtime preflight passed: Node ${nodeVersion}${npmVersion ? `, npm ${npmVersion}` : ''}.`);
