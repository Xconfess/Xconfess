#!/usr/bin/env node

const { execFileSync } = require('child_process');

function runDocker(args) {
  try {
    return {
      ok: true,
      stdout: execFileSync('docker', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return {
      ok: false,
      message: [error.message, error.stderr?.toString(), error.stdout?.toString()]
        .filter(Boolean)
        .join('\n'),
    };
  }
}

function isWindowsPipeError(message) {
  return /dockerDesktopLinuxEngine|\/\/\.\/pipe\/docker|The system cannot find the file specified/i.test(
    message,
  );
}

function printFailure(message) {
  console.error('Docker is not ready for local xConfess services.');
  console.error('');

  if (/not recognized|ENOENT|spawn docker/i.test(message)) {
    console.error('- Install Docker Desktop and restart your terminal so the docker CLI is on PATH.');
  } else if (isWindowsPipeError(message)) {
    console.error('- Open Docker Desktop, wait for the Linux engine to finish starting, then retry.');
    console.error('- If Docker Desktop is running on Windows containers, switch it to Linux containers.');
  } else {
    console.error('- Start Docker Desktop and wait until `docker info` succeeds.');
  }

  console.error('- Then run: npm run dev:services');
  console.error('');
  console.error('Original Docker error:');
  console.error(message.trim());
}

const version = runDocker(['--version']);
if (!version.ok) {
  printFailure(version.message);
  process.exit(1);
}

const info = runDocker(['info', '--format', '{{.ServerVersion}}']);
if (!info.ok) {
  printFailure(info.message);
  process.exit(1);
}

console.log(`Docker is available: ${version.stdout.trim()}`);
