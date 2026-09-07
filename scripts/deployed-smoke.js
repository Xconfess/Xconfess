#!/usr/bin/env node

const crypto = require('crypto');

const frontendUrl = process.env.SMOKE_FRONTEND_URL || process.env.FRONTEND_URL || 'https://xconfess.vercel.app';
const backendUrl = process.env.SMOKE_BACKEND_URL || process.env.BACKEND_URL || 'https://xconfess-backend.onrender.com';
const runMutation = process.env.SMOKE_RUN_MUTATION === 'true';

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function request(name, url, options = {}, expectedStatuses = [200]) {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const reason =
      error && error.name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : error && error.message
          ? error.message
          : String(error);
    throw new Error(`${name} request to ${url} failed in ${latencyMs}ms: ${reason}`);
  } finally {
    clearTimeout(timeoutId);
  }
  const latencyMs = Date.now() - started;
  if (!expectedStatuses.includes(response.status)) {
    const body = await response.text().catch(() => '');
    throw new Error(`${name} returned ${response.status} in ${latencyMs}ms: ${body.slice(0, 500)}`);
  }
  console.log(`${name}: ${response.status} (${latencyMs}ms)`);
  return response;
}

async function requestJson(name, url, options = {}, expectedStatuses = [200]) {
  const response = await request(name, url, options, expectedStatuses);
  return response.json();
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} did not return a JSON object`);
  }
}

function assertNoSensitiveKeys(name, value, path = '') {
  if (!value || typeof value !== 'object') return;

  const sensitive = /content|body|message|password|private.?key|seed|token|authorization|email|phone|ip|user.?agent/i;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (sensitive.test(key)) {
      throw new Error(`${name} exposed sensitive key: ${nextPath}`);
    }
    assertNoSensitiveKeys(name, child, nextPath);
  }
}

async function main() {
  await requestJson('backend liveness', joinUrl(backendUrl, '/api/health/live'));
  await requestJson('backend readiness', joinUrl(backendUrl, '/api/health/ready'));
  const healthStatus = await requestJson('backend health status', joinUrl(backendUrl, '/api/health/status'), {}, [200, 503]);
  assertObject('backend health status', healthStatus);

  const traction = await requestJson('public traction API', joinUrl(backendUrl, '/api/public/traction'));
  assertObject('public traction API', traction);
  assertNoSensitiveKeys('public traction API', traction);
  if (!traction.product || !traction.engagement || !traction.stellar || !traction.methodology) {
    throw new Error('public traction API is missing required aggregate sections');
  }

  const stellarConfig = await requestJson('public Stellar config', joinUrl(backendUrl, '/api/stellar/config'));
  assertObject('public Stellar config', stellarConfig);
  assertNoSensitiveKeys('public Stellar config', stellarConfig);
  if (!stellarConfig.network || !stellarConfig.contractIds) {
    throw new Error('public Stellar config is missing network or contractIds');
  }

  await request('frontend traction page', joinUrl(frontendUrl, '/traction'), {}, [200]);
  await request('frontend session anonymous', joinUrl(frontendUrl, '/api/auth/session'), {}, [401]);
  await request('frontend register method guard', joinUrl(frontendUrl, '/api/users/register'), {}, [405]);

  if (runMutation) {
    const suffix = crypto.randomBytes(4).toString('hex');
    await request(
      'frontend registration mutation',
      joinUrl(frontendUrl, '/api/users/register'),
      {
        method: 'POST',
        body: JSON.stringify({
          username: `smoke_${suffix}`,
          email: `smoke_${suffix}@example.com`,
          password: `SmokePass!${suffix}A1`,
        }),
      },
      [200, 201, 409],
    );
  } else {
    console.log('registration mutation skipped; set SMOKE_RUN_MUTATION=true to create a disposable account');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
