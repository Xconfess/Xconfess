const assert = require('node:assert/strict');
const test = require('node:test');

const { validate } = require('../check-contract-manifest-drift');
const { classifyLicense } = require('../check-package-distribution');
const { validate: validateErrors } = require('../check-error-registry-compatibility');

test('distribution policy accepts MIT and rejects GPL', () => {
  assert.equal(classifyLicense('MIT'), 'allowed');
  assert.equal(classifyLicense('GPL-3.0'), 'review-required');
});

test('contract manifest drift rejects missing contract names and IDs', () => {
  const errors = validate({
    abiManifest: { contracts: { demo: { version: '1.0.0' } } },
    wasmManifest: { contracts: { demo: { version: '1.0.0', sha256: 'a', wasm_file: 'demo.wasm' } } },
    testnetManifest: { contracts: { demo: { contract_id: 'C123', version: '1.0.0', sha256: 'a', wasm_file: 'demo.wasm' } } },
    contractNames: ['demo', 'other'],
  });
  assert.ok(errors.some((error) => error.includes('Missing WASM manifest contract: other') || error.includes('Missing testnet deployment contract ID for: other')));
});

test('error registry rejects renumbering and classification drift', () => {
  const history = { entries: [{ code: 6001, name: 'INVALID_TIP_AMOUNT', classification: 'Terminal', http_status: 400 }] };
  const fixtures = [{ code: 6001, name: 'INVALID_TIP_AMOUNT', classification: 'Retryable', http_status: 400 }];
  const errors = validateErrors(history, fixtures, new Map());
  assert.ok(errors.some((error) => error.includes('classification drift')));
});
