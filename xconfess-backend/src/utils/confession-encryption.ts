import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Resolve the configured AES key to the 32 raw bytes required by OpenSSL.
 *
 * Production configuration stores keys as 64-character hex (32 bytes), while
 * older callers/tests may still provide a 32-character UTF-8 key. Supporting
 * both formats keeps existing ciphertext readable without weakening the
 * production configuration contract.
 */
function resolveAesKey(key: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }

  if (key.length === 32) {
    return Buffer.from(key, 'utf8');
  }

  throw new Error(
    'Invalid AES key: expected 64 hexadecimal characters or 32 UTF-8 characters.',
  );
}

/**
 * Checks whether a given string matches the expected encrypted confession format (ivHex:cipherHex).
 */
export function isEncryptedConfession(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 2) return false;
  const [ivHex, encryptedHex] = parts;
  return (
    ivHex.length === IV_LENGTH * 2 &&
    /^[0-9a-fA-F]+$/.test(ivHex) &&
    encryptedHex.length > 0 &&
    /^[0-9a-fA-F]+$/.test(encryptedHex)
  );
}

/**
 * Security Invariant: Asserts that confession content is encrypted before database persistence.
 */
export function assertEncryptedBeforeSave(text: string): void {
  if (!isEncryptedConfession(text)) {
    throw new Error(
      'Security Invariant Violation: Confession content must be encrypted before persistence.',
    );
  }
}

/**
 * Encrypt plain text using AES-256-CBC.
 *
 * @param text - The plain text to encrypt.
 * @param key  - A 64-character hex key or legacy 32-character UTF-8 key.
 * @returns    - Hex-encoded IV + ':' + encrypted cipher text.
 */
export function encryptConfession(text: string, key: string): string {
  const keyBytes = resolveAesKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBytes, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const result = iv.toString('hex') + ':' + encrypted;
  assertEncryptedBeforeSave(result);
  return result;
}

/**
 * Decrypt cipher text that was produced by {@link encryptConfession}.
 *
 * @param encryptedText - The `iv:cipherText` string returned by `encryptConfession`.
 * @param key           - The same configured AES key used for encryption.
 * @returns             - The original plain text.
 */
export function decryptConfession(encryptedText: string, key: string): string {
  const keyBytes = resolveAesKey(key);
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBytes, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Safely decrypts encrypted confession ciphertext.
 * Ensures stored blob is encrypted and prevents raw ciphertext leakage on decryption error.
 */
export function safeDecryptConfession(
  encryptedText: string,
  key: string,
): string {
  if (!isEncryptedConfession(encryptedText)) {
    throw new Error('Confession content in storage is not properly encrypted.');
  }
  try {
    return decryptConfession(encryptedText, key);
  } catch (err: any) {
    throw new Error(`Failed to decrypt confession content: ${err.message}`);
  }
}
