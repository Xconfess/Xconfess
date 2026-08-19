import { createHash, randomBytes, webcrypto } from 'crypto';

/** Protocol version stored in ciphertext envelopes. */
export const MESSAGE_E2E_VERSION = 1;
export const MESSAGE_E2E_INFO = 'xconfess-e2e-v1';
export const ENCRYPTED_PREVIEW = '[Encrypted message]';

/** AES-256-GCM nonce size in bytes (96 bits, per NIST SP 800-38D). */
const GCM_NONCE_BYTES = 12;
/** AES-256-GCM auth tag size in bytes — the minimum possible ciphertext length. */
const GCM_TAG_BYTES = 16;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const ENVELOPE_KEYS = ['v', 'alg', 'iv', 'ct'] as const;

export interface MessageCiphertextEnvelope {
  v: number;
  alg: 'aes-256-gcm';
  iv: string;
  ct: string;
}

export interface MessageKeyPair {
  publicKey: string;
  privateKey: string;
}

const subtle = webcrypto.subtle;

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function buildThreadId(confessionId: string, senderAnonId: string): string {
  return `${confessionId}:${senderAnonId}`;
}

export function serializeEnvelope(envelope: MessageCiphertextEnvelope): string {
  return JSON.stringify(envelope);
}

/** Decoded byte length of a base64url string, or -1 if the string is not valid base64url. */
function base64UrlByteLength(value: string): number {
  if (typeof value !== 'string' || value.length === 0 || !BASE64URL_RE.test(value)) {
    return -1;
  }
  return fromBase64Url(value).length;
}

export function parseEnvelope(payload: string): MessageCiphertextEnvelope | null {
  if (typeof payload !== 'string') {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  // Reject envelopes carrying unexpected fields — a strict shape prevents
  // smuggling extra data through a payload that otherwise looks valid.
  const keys = Object.keys(parsed);
  if (
    keys.length !== ENVELOPE_KEYS.length ||
    !ENVELOPE_KEYS.every((key) => keys.includes(key))
  ) {
    return null;
  }

  const candidate = parsed as MessageCiphertextEnvelope;
  if (
    candidate.v !== MESSAGE_E2E_VERSION ||
    candidate.alg !== 'aes-256-gcm'
  ) {
    return null;
  }

  if (base64UrlByteLength(candidate.iv) !== GCM_NONCE_BYTES) {
    return null;
  }

  if (base64UrlByteLength(candidate.ct) < GCM_TAG_BYTES) {
    return null;
  }

  return candidate;
}

export function isEncryptedPayload(payload: string): boolean {
  return parseEnvelope(payload) !== null;
}

async function importX25519PrivateKey(privateKeyBase64Url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(privateKeyBase64Url);
  return subtle.importKey('pkcs8', raw, { name: 'X25519' }, false, ['deriveBits']);
}

async function importX25519PublicKey(publicKeyBase64Url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(publicKeyBase64Url);
  return subtle.importKey('raw', raw, { name: 'X25519' }, false, []);
}

export async function generateMessageKeyPair(): Promise<MessageKeyPair> {
  const keyPair = (await subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;

  const publicJwk = await subtle.exportKey('raw', keyPair.publicKey);
  const privatePkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: toBase64Url(new Uint8Array(publicJwk)),
    privateKey: toBase64Url(new Uint8Array(privatePkcs8)),
  };
}

export async function deriveThreadKey(
  privateKeyBase64Url: string,
  peerPublicKeyBase64Url: string,
  threadId: string,
): Promise<CryptoKey> {
  const privateKey = await importX25519PrivateKey(privateKeyBase64Url);
  const peerPublicKey = await importX25519PublicKey(peerPublicKeyBase64Url);

  const sharedBits = await subtle.deriveBits(
    { name: 'X25519', public: peerPublicKey },
    privateKey,
    256,
  );

  const salt = createHash('sha256').update(threadId).digest();
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, [
    'deriveKey',
  ]);

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(MESSAGE_E2E_INFO),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptMessage(
  plaintext: string,
  privateKeyBase64Url: string,
  peerPublicKeyBase64Url: string,
  threadId: string,
): Promise<string> {
  const key = await deriveThreadKey(
    privateKeyBase64Url,
    peerPublicKeyBase64Url,
    threadId,
  );
  const iv = randomBytes(12);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return serializeEnvelope({
    v: MESSAGE_E2E_VERSION,
    alg: 'aes-256-gcm',
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
  });
}

export async function decryptMessage(
  payload: string,
  privateKeyBase64Url: string,
  peerPublicKeyBase64Url: string,
  threadId: string,
): Promise<string> {
  const envelope = parseEnvelope(payload);
  if (!envelope) {
    throw new Error('Invalid E2E ciphertext envelope');
  }

  const key = await deriveThreadKey(
    privateKeyBase64Url,
    peerPublicKeyBase64Url,
    threadId,
  );

  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(envelope.iv) },
    key,
    fromBase64Url(envelope.ct),
  );

  return new TextDecoder().decode(plaintext);
}

export async function wrapPrivateKeyWithPassphrase(
  privateKeyBase64Url: string,
  passphrase: string,
): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const wrapKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    new TextEncoder().encode(privateKeyBase64Url),
  );

  return JSON.stringify({
    v: 1,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
  });
}

export async function unwrapPrivateKeyWithPassphrase(
  wrappedPayload: string,
  passphrase: string,
): Promise<string> {
  const parsed = JSON.parse(wrappedPayload) as {
    v: number;
    salt: string;
    iv: string;
    ct: string;
  };

  if (parsed.v !== 1) {
    throw new Error('Unsupported key backup version');
  }

  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const wrapKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64Url(parsed.salt),
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(parsed.iv) },
    wrapKey,
    fromBase64Url(parsed.ct),
  );

  return new TextDecoder().decode(plaintext);
}
