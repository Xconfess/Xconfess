#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'secret-scanning-preflight.sh');
const args = process.argv.slice(2);
const candidates =
  process.platform === 'win32'
    ? [
        ['py', ['-3']],
        ['python', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ];

for (const [command, prefixArgs] of candidates) {
  const result = spawnSync(command, [...prefixArgs, script, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error && result.error.code === 'ENOENT') {
    continue;
  }

  if (result.status !== null) {
    process.exit(result.status);
  }
}

console.error('Unable to find Python. Install python3 or python to run secret scanning.');
process.exit(1);
