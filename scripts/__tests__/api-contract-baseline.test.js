'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lib = require('../lib/openapi-contract');
const CLI = path.resolve(__dirname, '..', 'api-contract-baseline.js');

function minimalSpec(pathName = '/confessions', operation = { responses: { '200': { description: 'OK' } } }) {
  return {
    openapi: '3.0.0',
    info: { title: 'xConfess API', version: '1.0.0' },
    paths: { [pathName]: { get: operation } },
  };
}

function severities(result, code) {
  return result.changes.filter((change) => change.code === code).map((change) => change.severity);
}

test('normalizePath is stable across frontend and OpenAPI path styles', () => {
  assert.equal(lib.normalizePath('/api/confessions/${id}'), '/confessions/{id}');
  assert.equal(lib.normalizePath('/confessions/[id]/'), '/confessions/{id}');
  assert.equal(lib.normalizePath('/api/users/[...slug]'), '/users/{slug}');
  assert.equal(lib.normalizePath('health/live?verbose=1'), '/health/live');
});

test('normalization removes environment-specific hosts, URLs, emails and keys', () => {
  const spec = {
    openapi: '3.0.0',
    servers: [{ url: 'https://api.production.example.com' }],
    externalDocs: { url: 'https://internal.example.com/docs' },
    info: {
      title: 'xConfess API',
      version: '1.0.0',
      contact: { email: 'alice@company.example' },
      description: 'Contact ops@company.example at https://status.internal.example.com',
    },
    paths: {
      '/health': {
        get: {
          description: 'Ping 10.0.0.4 or email dev@company.example',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  const normalized = lib.normalizeOpenApi(spec);
  assert.equal(normalized.servers, undefined);
  assert.equal(normalized.externalDocs, undefined);
  assert.equal(normalized.info.contact, undefined);
  const text = JSON.stringify(normalized);
  assert.ok(!text.includes('production.example.com'));
  assert.ok(!text.includes('alice@company.example'));
  assert.ok(!text.includes('10.0.0.4'));
  assert.ok(text.includes('<url>'));
  assert.ok(text.includes('<email>'));
  assert.ok(text.includes('<ip>'));

  const reordered = JSON.parse(JSON.stringify(spec));
  reordered.paths['/other'] = { get: { responses: { '200': { description: 'OK' } } } };
  reordered.info = { description: spec.info.description, version: '1.0.0', title: 'xConfess API' };
  assert.equal(lib.normalizedDigest(spec), lib.normalizedDigest(spec));
  assert.notEqual(lib.normalizedDigest(spec), lib.normalizedDigest(reordered));
});

test('operation additions are non-breaking and removals are breaking', () => {
  const baseline = minimalSpec('/confessions');
  const current = minimalSpec('/confessions');
  current.paths['/tags'] = { get: { responses: { '200': { description: 'OK' } } } };
  let result = lib.compareOpenApi({ baseline, current });
  assert.deepEqual(severities(result, 'operation.added'), ['non-breaking']);
  assert.equal(result.counts.breaking, 0);

  result = lib.compareOpenApi({ baseline: current, current: baseline });
  assert.deepEqual(severities(result, 'operation.removed'), ['breaking']);
});

test('schema changes are classified by consumer impact', () => {
  const baseline = minimalSpec('/confessions', {
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id'],
              properties: {
                id: { type: 'string' },
                mood: { type: 'string', enum: ['calm', 'happy'] },
                optional: { type: 'string' },
              },
            },
          },
        },
      },
    },
  });
  const current = JSON.parse(JSON.stringify(baseline));
  const schema = current.paths['/confessions'].get.responses['200'].content['application/json'].schema;
  schema.required.push('newRequired');
  delete schema.properties.optional;
  schema.properties.id.type = 'number';
  schema.properties.mood.enum.push('sad');
  schema.properties.mood.enum.shift();

  const result = lib.compareOpenApi({ baseline, current });
  assert.deepEqual(severities(result, 'schema.required'), ['breaking']);
  assert.deepEqual(severities(result, 'schema.property'), ['breaking']);
  assert.deepEqual(severities(result, 'schema.type'), ['breaking']);
  assert.deepEqual(severities(result, 'schema.enum'), ['breaking', 'non-breaking']);
  assert.ok(result.counts.breaking >= 4);
});

test('parameter, body, and response contract changes are classified', () => {
  const baseline = minimalSpec('/confessions', {
    parameters: [{ in: 'query', name: 'cursor', required: false, schema: { type: 'string' } }],
    responses: { '200': { description: 'OK' } },
  });
  const current = JSON.parse(JSON.stringify(baseline));
  current.paths['/confessions'].get.parameters.push({ in: 'query', name: 'limit', required: true, schema: { type: 'integer' } });
  current.paths['/confessions'].get.responses['201'] = { description: 'Created' };
  delete current.paths['/confessions'].get.responses['200'];
  current.paths['/confessions'].get.requestBody = { required: true, content: {} };

  const result = lib.compareOpenApi({ baseline, current });
  assert.deepEqual(severities(result, 'parameter.added'), ['breaking']);
  assert.deepEqual(severities(result, 'response.removed'), ['breaking']);
  assert.deepEqual(severities(result, 'response.added'), ['non-breaking']);
  assert.deepEqual(severities(result, 'requestBody.added'), ['breaking']);
});

test('report summarizes counts and flags proxy-derived seed baselines', () => {
  const result = lib.compareOpenApi({ baseline: minimalSpec('/a'), current: minimalSpec('/b') });
  const report = lib.formatReport({
    changes: result.changes,
    counts: result.counts,
    baselineDigest: 'a'.repeat(64),
    currentDigest: 'b'.repeat(64),
    seedBaseline: true,
  });
  assert.ok(report.includes('| Breaking | 1 |'));
  assert.ok(report.includes('| Non-breaking | 1 |'));
  assert.ok(report.includes('proxy-derived seed'));
  assert.ok(report.includes('Operation GET /a was removed.'));
});

test('CLI check fails on breaking changes and update records an explicit baseline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-contract-'));
  const specPath = path.join(dir, 'openapi.json');
  const baselinePath = path.join(dir, 'baseline.json');
  const reportPath = path.join(dir, 'summary.md');
  fs.writeFileSync(specPath, JSON.stringify(minimalSpec('/confessions')));

  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  assert.equal(run(['update', `--spec=${specPath}`, `--baseline=${baselinePath}`]).status, 0);
  assert.equal(run(['check', `--spec=${specPath}`, `--baseline=${baselinePath}`, `--report=${reportPath}`]).status, 0);
  assert.ok(fs.readFileSync(reportPath, 'utf8').includes('No API contract changes detected.'));

  const breaking = minimalSpec('/other');
  fs.writeFileSync(specPath, JSON.stringify(breaking));
  const failed = run(['check', `--spec=${specPath}`, `--baseline=${baselinePath}`, `--report=${reportPath}`]);
  assert.equal(failed.status, 1);
  assert.ok(failed.stderr.includes('breaking change'));
  assert.ok(fs.readFileSync(reportPath, 'utf8').includes('Operation GET /confessions was removed.'));

  const allowed = run(['check', `--spec=${specPath}`, `--baseline=${baselinePath}`, '--allow-breaking']);
  assert.equal(allowed.status, 0);
});
