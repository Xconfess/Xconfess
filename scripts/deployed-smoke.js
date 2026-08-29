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
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const latencyMs = Date.now() - started;
  if (!expectedStatuses.includes(response.status)) {
    const body = await response.text().catch(() => '');
    throw new Error(`${name} returned ${response.status} in ${latencyMs}ms: ${body.slice(0, 500)}`);
  }
  console.log(`${name}: ${response.status} (${latencyMs}ms)`);
  return response;
}

async function main() {
  await request('backend liveness', joinUrl(backendUrl, '/api/health/live'));
  await request('backend readiness', joinUrl(backendUrl, '/api/health/ready'));
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
