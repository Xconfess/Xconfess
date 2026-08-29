const fs = require('fs');
const net = require('net');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const backendEnvPath = path.join(repoRoot, 'xconfess-backend', '.env');
const frontendEnvPath = path.join(repoRoot, 'xconfess-frontend', '.env.local');

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function canConnect(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function main() {
  const backendEnv = parseEnv(backendEnvPath);
  const frontendEnv = parseEnv(frontendEnvPath);

  const checks = [
    {
      name: 'Backend .env',
      ok: fs.existsSync(backendEnvPath),
      fix: 'Copy xconfess-backend/.env.example to xconfess-backend/.env.',
    },
    {
      name: 'Frontend .env.local',
      ok: fs.existsSync(frontendEnvPath),
      fix: 'Copy xconfess-frontend/.env.example to xconfess-frontend/.env.local.',
    },
  ];

  const dbHost = backendEnv.DB_HOST || 'localhost';
  const dbPort = Number(backendEnv.DB_PORT || 55432);
  const redisHost = backendEnv.REDIS_HOST || 'localhost';
  const redisPort = Number(backendEnv.REDIS_PORT || 6379);

  checks.push({
    name: `Postgres ${dbHost}:${dbPort}`,
    ok: await canConnect(dbHost, dbPort),
    fix: 'Run: npm run dev:services, wait for healthy containers, then check: docker compose -f compose.yaml ps',
  });

  checks.push({
    name: `Redis ${redisHost}:${redisPort}`,
    ok: await canConnect(redisHost, redisPort),
    fix: 'Run: npm run dev:services, wait for healthy containers, then check: docker compose -f compose.yaml ps',
  });

  const failed = checks.filter((check) => !check.ok);

  for (const check of checks) {
    console.log(`${check.ok ? 'OK ' : 'ERR'} ${check.name}`);
    if (!check.ok) console.log(`    ${check.fix}`);
  }

  if (failed.length > 0) {
    console.log('\nLocal services are not ready.');
    console.log('Fast path: npm run dev:services');
    console.log('If containers show "starting" or "unhealthy", wait a few seconds and run: docker compose -f compose.yaml ps');
    process.exit(1);
  }

  if (!frontendEnv.NEXT_PUBLIC_API_URL) {
    console.log('WARN Frontend NEXT_PUBLIC_API_URL is not set; proxy routes may not reach the backend.');
  }

  console.log('\nLocal contributor preflight passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
