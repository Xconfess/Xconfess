#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const files = [
  {
    source: path.join(repoRoot, 'xconfess-backend', '.env.example'),
    target: path.join(repoRoot, 'xconfess-backend', '.env'),
    label: 'backend',
  },
  {
    source: path.join(repoRoot, 'xconfess-frontend', '.env.example'),
    target: path.join(repoRoot, 'xconfess-frontend', '.env.local'),
    label: 'frontend',
  },
];

for (const file of files) {
  const relativeTarget = path.relative(repoRoot, file.target);
  if (fs.existsSync(file.target)) {
    console.log(`SKIP ${relativeTarget} already exists`);
    continue;
  }

  fs.copyFileSync(file.source, file.target, fs.constants.COPYFILE_EXCL);
  console.log(`CREATE ${relativeTarget} from ${path.relative(repoRoot, file.source)}`);
}

console.log('');
console.log('Next required local backend values:');
console.log('- JWT_SECRET: any 32+ character local-only random string');
console.log('- APP_SECRET: any 32+ character local-only random string');
console.log('- CONFESSION_ENCRYPTION_KEY: 64 hex characters');
console.log('- ENCRYPTION_MASTER_KEY_v1: 64 hex characters');
console.log('');
console.log('The checked-in .env.example values are safe placeholders for local boot only.');
