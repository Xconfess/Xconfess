const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  assertNoSensitiveKeys,
  joinUrl,
  request,
  requestJson,
} = require('../deployed-smoke');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('request accepts the documented proxy status mapping', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(req.url === '/ready' ? 503 : 401, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify({ status: 'degraded' }));
    },
    async (baseUrl) => {
      await assert.doesNotReject(
        request('readiness', joinUrl(baseUrl, '/ready'), {}, [200, 503]),
      );
      await assert.doesNotReject(
        request('anonymous session', joinUrl(baseUrl, '/session'), {}, [401]),
      );
    },
  );
});

test('request rejects an unexpected proxy status with a bounded response body', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('upstream unavailable');
    },
    async (baseUrl) => {
      await assert.rejects(
        request('proxy', baseUrl, {}, [200]),
        /proxy returned 502.*upstream unavailable/,
      );
    },
  );
});

test('requestJson parses representative proxy JSON and rejects sensitive keys', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ users: { total: 2 }, reliability: { uptime: 99 } }));
    },
    async (baseUrl) => {
      const payload = await requestJson('traction proxy', baseUrl);
      assert.equal(payload.users.total, 2);
      assert.doesNotThrow(() => assertNoSensitiveKeys('traction proxy', payload));
      assert.throws(
        () => assertNoSensitiveKeys('unsafe proxy', { accessToken: 'fixture' }),
        /exposed sensitive key: accessToken/,
      );
    },
  );
});
