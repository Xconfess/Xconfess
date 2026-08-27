#!/usr/bin/env node
/**
 * scripts/decrypt-smoke-test.js
 *
 * Post-restore decryption verification.
 * Pulls a known confession from the restored DB, decrypts it,
 * and compares the content hash against the pre-disaster reference.
 *
 * Usage:
 *   node scripts/decrypt-smoke-test.js
 *
 * Required env vars:
 *   DATABASE_URL      — restored Postgres connection string
 *   AWS_SECRET_NAME   — e.g. "xconfess/encryption-key"
 *   SMOKE_CONFESSION_ID  — UUID of the test confession
 *   SMOKE_EXPECTED_HASH  — sha256 of the plaintext (hex)
 */

'use strict';

const { Client } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { createDecipheriv, createHash, randomBytes } = require('crypto');

const {
  DATABASE_URL,
  AWS_SECRET_NAME = 'xconfess/encryption-key',
  SMOKE_CONFESSION_ID,
  SMOKE_EXPECTED_HASH,
} = process.env;

if (!DATABASE_URL || !SMOKE_CONFESSION_ID || !SMOKE_EXPECTED_HASH) {
  console.error('Missing required env vars: DATABASE_URL, SMOKE_CONFESSION_ID, SMOKE_EXPECTED_HASH');
  process.exit(1);
}

async function getEncryptionKey() {
  const client = new SecretsManagerClient({});
  const cmd = new GetSecretValueCommand({ SecretId: AWS_SECRET_NAME });
  const res = await client.send(cmd);
  const key = res.SecretString;
  if (!key || key.length !== 64) {
    throw new Error(`Invalid key length from secrets manager: ${key?.length}`);
  }
  return Buffer.from(key, 'hex');
}

/**
 * Decrypt AES-256-GCM ciphertext.
 * Expected stored format: <12-byte IV (hex)>:<16-byte auth tag (hex)>:<ciphertext (hex)>
 */
function decrypt(encryptedField, keyBuffer) {
  const [ivHex, tagHex, ciphertextHex] = encryptedField.split(':');
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted field — expected iv:tag:ciphertext');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function main() {
  console.log('🔍 XConfess — DR decryption smoke test');
  console.log(`   Confession ID: ${SMOKE_CONFESSION_ID}`);

  // 1. Fetch encryption key from secrets manager
  console.log('\n[1/4] Fetching encryption key from secrets manager...');
  const keyBuffer = await getEncryptionKey();
  console.log('      ✅ Key retrieved (length OK)');

  // 2. Connect to restored DB
  console.log('\n[2/4] Connecting to restored Postgres...');
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log('      ✅ Connected');

  // 3. Fetch encrypted confession
  console.log('\n[3/4] Fetching encrypted confession row...');
  const { rows } = await db.query(
    'SELECT encrypted_content FROM confessions WHERE id = $1',
    [SMOKE_CONFESSION_ID],
  );
  await db.end();

  if (!rows.length) {
    throw new Error(`Confession ${SMOKE_CONFESSION_ID} not found in restored DB`);
  }
  console.log('      ✅ Row found');

  // 4. Decrypt and compare hash
  console.log('\n[4/4] Decrypting and verifying hash...');
  const plaintext = decrypt(rows[0].encrypted_content, keyBuffer);
  const actualHash = createHash('sha256').update(plaintext).digest('hex');

  if (actualHash !== SMOKE_EXPECTED_HASH) {
    console.error(`\n❌ Hash mismatch!`);
    console.error(`   Expected: ${SMOKE_EXPECTED_HASH}`);
    console.error(`   Got:      ${actualHash}`);
    process.exit(1);
  }

  console.log('      ✅ Decryption successful — content hash matches reference');
  console.log('\n✅ DR smoke test PASSED — encryption keys intact after restore\n');
}

main().catch((err) => {
  console.error('\n❌ DR smoke test FAILED:', err.message);
  process.exit(1);
});