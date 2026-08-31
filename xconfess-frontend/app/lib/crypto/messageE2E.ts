/** Client-side E2E crypto for private messages (mirrors backend protocol). */

export const MESSAGE_E2E_VERSION = 1;
export const MESSAGE_E2E_INFO = 'xconfess-e2e-v1';
export const ENCRYPTED_PREVIEW = '[Encrypted message]';

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

const subtle = globalThis.crypto.subtle;

function asBufferSource(value: Uint8Array | ArrayBuffer): BufferSource {
  return value as unknown as BufferSource;
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sha256(data: string): Promise<ArrayBuffer> {
  return subtle.digest('SHA-256', new TextEncoder().encode(data));
}

export function buildThreadId(confessionId: string, senderAnonId: string): string {
  return `${confessionId}:${senderAnonId}`;
}

export function parseEnvelope(payload: string): MessageCiphertextEnvelope | null {
  try {
    const parsed = JSON.parse(payload) as MessageCiphertextEnvelope;
    if (
      parsed?.v === MESSAGE_E2E_VERSION &&
      parsed.alg === 'aes-256-gcm' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ct === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function isEncryptedPayload(payload: string): boolean {
  return parseEnvelope(payload) !== null;
}

async function importX25519PrivateKey(privateKeyBase64Url: string): Promise<CryptoKey> {
  return subtle.importKey(
    'pkcs8',
    asBufferSource(fromBase64Url(privateKeyBase64Url)),
    { name: 'X25519' },
    false,
    ['deriveBits'],
  );
}

async function importX25519PublicKey(publicKeyBase64Url: string): Promise<CryptoKey> {
  return subtle.importKey(
    'raw',
    asBufferSource(fromBase64Url(publicKeyBase64Url)),
    { name: 'X25519' },
    false,
    [],
  );
}

export async function generateMessageKeyPair(): Promise<MessageKeyPair> {
  const keyPair = (await subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;
  const publicRaw = await subtle.exportKey('raw', keyPair.publicKey);
  const privatePkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: toBase64Url(new Uint8Array(publicRaw)),
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

  const salt = new Uint8Array(await sha256(threadId));
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      info: asBufferSource(new TextEncoder().encode(MESSAGE_E2E_INFO)),
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
  const key = await deriveThreadKey(privateKeyBase64Url, peerPublicKeyBase64Url, threadId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(plaintext)),
  );

  return JSON.stringify({
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

  const key = await deriveThreadKey(privateKeyBase64Url, peerPublicKeyBase64Url, threadId);
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(fromBase64Url(envelope.iv)) },
    key,
    asBufferSource(fromBase64Url(envelope.ct)),
  );

  return new TextDecoder().decode(plaintext);
}

export async function wrapPrivateKeyWithPassphrase(
  privateKeyBase64Url: string,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await subtle.importKey(
    'raw',
    asBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const wrapKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations: 310_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    wrapKey,
    asBufferSource(new TextEncoder().encode(privateKeyBase64Url)),
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
    asBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const wrapKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBufferSource(fromBase64Url(parsed.salt)),
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(fromBase64Url(parsed.iv)) },
    wrapKey,
    asBufferSource(fromBase64Url(parsed.ct)),
  );

  return new TextDecoder().decode(plaintext);
}
