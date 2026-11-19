const assert = require('node:assert/strict');
const test = require('node:test');
const { validateContractCompatibility } = require('../check-contract-compatibility');
const { validateNetworkConfiguration } = require('../network-config');
const { waitForServices } = require('../wait-for-services');
const { extractProxyRoutes, validateApiContract } = require('../check-api-contract-drift');

test('contract compatibility rejects a changed runtime marker', () => {
  const errors = validateContractCompatibility({
    manifest: { contracts: { demo: { version: '1.0.0', event_schema_version: 1, error_registry_version: 1, functions: ['initialize'] } } },
    abiByContract: { demo: { version: '1.0.0', event_schema_version: 2, error_registry_version: 1, functions: ['initialize'] } },
    releaseContracts: ['demo'],
  });
  assert.match(errors.join('\n'), /event_schema_version mismatch/);
});

test('network validation rejects a testnet app pointed at mainnet', () => {
  const errors = validateNetworkConfiguration({
    network: 'testnet',
    deploymentNetwork: 'testnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
  });
  assert.match(errors.join('\n'), /STELLAR_HORIZON_URL/);
});

test('service wait completes only after every service is healthy', async () => {
  const calls = [];
  const result = await waitForServices({
    services: [{ name: 'db', host: 'db', port: 1 }, { name: 'cache', host: 'cache', port: 2 }],
    intervalMs: 0,
    timeoutMs: 10,
    check: async (service) => { calls.push(service.name); return { ok: service.name === 'db' }; },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.pending, ['cache']);
  assert.ok(calls.includes('db'));
});

test('API drift check accepts a proxy route represented in OpenAPI', () => {
  const source = `export async function POST() { return resolveBackendRoute(request, \`/users/\${id}/profile\`); }`;
  const routes = extractProxyRoutes(source, 'app/api/users/[id]/route.ts');
  assert.deepEqual(routes[0], { path: '/users/{id}/profile', method: 'POST', filePath: 'app/api/users/[id]/route.ts' });
  assert.deepEqual(validateApiContract({ spec: { paths: { '/users/{id}/profile': { post: {} } } }, proxyRoutes: routes }), []);
});
