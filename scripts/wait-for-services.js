#!/usr/bin/env node

const net = require('net');

const DEFAULT_SERVICES = [
  { name: 'PostgreSQL', host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432) },
  { name: 'Redis', host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) },
];

function checkTcpService({ host, port, timeoutMs = 2000, protocol }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
    socket.once('connect', () => {
      if (protocol === 'redis') {
        socket.write('*1\r\n$4\r\nPING\r\n');
        socket.once('data', (data) => {
          clearTimeout(timer);
          finish({ ok: data.toString().trim() === '+PONG', reason: data.toString().trim() });
        });
      } else {
        clearTimeout(timer);
        finish({ ok: true });
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, reason: error.code || error.message });
    });
  });
}

async function waitForServices({
  services = DEFAULT_SERVICES,
  timeoutMs = Number(process.env.SERVICE_WAIT_TIMEOUT_MS || 60000),
  intervalMs = Number(process.env.SERVICE_WAIT_INTERVAL_MS || 1000),
  check = checkTcpService,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  const pending = new Map(services.map((service) => [service.name, service]));
  const failures = new Map();

  while (pending.size && Date.now() < deadline) {
    for (const [name, service] of pending) {
      const result = await check({ ...service, protocol: service.protocol || (name.toLowerCase() === 'redis' ? 'redis' : undefined) });
      if (result.ok) pending.delete(name);
      else failures.set(name, result.reason || 'unhealthy');
    }
    if (pending.size) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ok: pending.size === 0, pending: [...pending.keys()], failures };
}

async function main() {
  const result = await waitForServices();
  if (!result.ok) {
    console.error(`Service health gate failed after ${process.env.SERVICE_WAIT_TIMEOUT_MS || 60000}ms.`);
    for (const name of result.pending) console.error(`- ${name}: ${result.failures.get(name) || 'unhealthy'}`);
    process.exitCode = 1;
    return;
  }
  console.log('PostgreSQL and Redis service health gate passed.');
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { DEFAULT_SERVICES, checkTcpService, waitForServices };
