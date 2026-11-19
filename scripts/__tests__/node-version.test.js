'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const checker = path.resolve(__dirname, '..', 'check-node-version.js');

function run(nodeVersion, npmVersion) {
  return spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_VERSION_OVERRIDE: nodeVersion,
      NPM_VERSION_OVERRIDE: npmVersion,
    },
  });
}

test('accepts Node 22 and npm 9+', () => {
  const supported = run('v22.14.0', '10.9.3');
  assert.equal(supported.status, 0);
  assert.match(supported.stdout, /Runtime preflight passed/);
});

test('rejects unsupported Node majors', () => {
  for (const unsupported of ['v20.19.0', 'v23.1.0', 'v18.20.0']) {
    const result = run(unsupported, '10.9.3');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Node\.js 22\.x is required/);
  }
});

test('rejects npm below 9', () => {
  const result = run('v22.14.0', '8.19.4');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm 9\+ is required/);
});
