import { Keypair } from "@stellar/stellar-sdk";

const STORAGE_KEY = "xconfess.embedded-wallet.v1";
const SESSION_LOCK_KEY = "xconfess.embedded-wallet.locked";
const PBKDF2_ITERATIONS = 310_000;
const FAILED_ATTEMPTS_KEY = "xconfess.embedded-wallet.failed-attempts";
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export type EncryptedWallet = {
  version: 1;
  cipher: "AES-GCM";
  kdf: "PBKDF2-SHA-256";
  salt: string;
  iv: string;
  ciphertext: string;
  publicKey: string;
  network: "testnet" | "mainnet";
  createdAt: string;
};

const bytesToBase64 = (bytes: Uint8Array) => { let binary = ""; bytes.forEach((byte) => (binary += String.fromCharCode(byte))); return btoa(binary); };
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

function isEncryptedWallet(value: unknown): value is EncryptedWallet {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedWallet>;
  if (candidate.version !== 1 || candidate.cipher !== "AES-GCM" || candidate.kdf !== "PBKDF2-SHA-256") return false;
  if (candidate.network !== "testnet" && candidate.network !== "mainnet") return false;
  if (![candidate.salt, candidate.iv, candidate.ciphertext, candidate.publicKey, candidate.createdAt].every((field) => typeof field === "string" && field.length > 0)) return false;
  try {
    const salt = base64ToBytes(candidate.salt!);
    const iv = base64ToBytes(candidate.iv!);
    const ciphertext = base64ToBytes(candidate.ciphertext!);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) return false;
    Keypair.fromPublicKey(candidate.publicKey!);
    return Number.isFinite(Date.parse(candidate.createdAt!));
  } catch {
    return false;
  }
}
async function deriveKey(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string, pin: string) {
  if (!/^[0-9]{6,12}$/.test(pin)) throw new Error("Wallet PIN must be 6–12 digits");
  const weak = /^(.)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin);
  if (weak) throw new Error("Choose a less predictable wallet PIN");
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await deriveKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(secret));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptSecret(wallet: EncryptedWallet, pin: string) {
  try { const key = await deriveKey(pin, base64ToBytes(wallet.salt)); const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(wallet.iv) }, key, base64ToBytes(wallet.ciphertext)); return new TextDecoder().decode(plaintext); }
  catch { throw new Error("Incorrect wallet PIN"); }
}

export async function createEmbeddedWallet(pin: string, network: EncryptedWallet["network"] = "testnet") {
  const keypair = Keypair.random(); const encrypted = await encryptSecret(keypair.secret(), pin);
  const wallet: EncryptedWallet = { version: 1, cipher: "AES-GCM", kdf: "PBKDF2-SHA-256", ...encrypted, publicKey: keypair.publicKey(), network, createdAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)); unlockEmbeddedWalletSession(); return wallet;
}

export async function importEmbeddedWallet(secret: string, pin: string, network: EncryptedWallet["network"] = "testnet") {
  const keypair = Keypair.fromSecret(secret.trim()); const encrypted = await encryptSecret(keypair.secret(), pin);
  const wallet: EncryptedWallet = { version: 1, cipher: "AES-GCM", kdf: "PBKDF2-SHA-256", ...encrypted, publicKey: keypair.publicKey(), network, createdAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)); unlockEmbeddedWalletSession(); return wallet;
}

export function getEmbeddedWallet(): EncryptedWallet | null { try { const value = localStorage.getItem(STORAGE_KEY); if (!value) return null; const parsed = JSON.parse(value); return isEncryptedWallet(parsed) ? parsed : null; } catch { return null; } }
export function isEmbeddedWalletLocked() { return localStorage.getItem(SESSION_LOCK_KEY) === "true"; }
export function lockEmbeddedWallet() { localStorage.setItem(SESSION_LOCK_KEY, "true"); }
export function unlockEmbeddedWalletSession() { localStorage.removeItem(SESSION_LOCK_KEY); }
export function getActiveEmbeddedWallet() { return isEmbeddedWalletLocked() ? null : getEmbeddedWallet(); }
export function removeEmbeddedWallet() { localStorage.removeItem(STORAGE_KEY); }
export async function unlockEmbeddedWallet(pin: string) {
  const wallet = getEmbeddedWallet();
  if (!wallet) throw new Error("No embedded wallet found");
  const attempts = JSON.parse(localStorage.getItem(FAILED_ATTEMPTS_KEY) || "null") as { count: number; lockedUntil: number } | null;
  if (attempts?.lockedUntil && attempts.lockedUntil > Date.now()) throw new Error("Wallet temporarily locked after too many incorrect PIN attempts");
  try {
    const keypair = Keypair.fromSecret(await decryptSecret(wallet, pin));
    if (keypair.publicKey() !== wallet.publicKey) throw new Error("Wallet backup is invalid");
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    return keypair;
  } catch (error) {
    const count = (attempts?.count ?? 0) + 1;
    localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify({ count, lockedUntil: count >= MAX_PIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 }));
    if (count >= MAX_PIN_ATTEMPTS) throw new Error("Wallet temporarily locked after too many incorrect PIN attempts");
    throw error;
  }
}
export async function changeEmbeddedWalletPin(currentPin: string, nextPin: string) {
  const wallet = getEmbeddedWallet();
  if (!wallet) throw new Error("No embedded wallet found");
  const secret = await decryptSecret(wallet, currentPin);
  const encrypted = await encryptSecret(secret, nextPin);
  const updated = { ...wallet, ...encrypted };
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
export function exportEncryptedBackup() { const wallet = getEmbeddedWallet(); if (!wallet) throw new Error("No embedded wallet found"); return JSON.stringify({ format: "xconfess-embedded-wallet", ...wallet }, null, 2); }
export function importEncryptedBackup(payload: string) { let parsed: unknown; try { parsed = JSON.parse(payload); } catch { throw new Error("Unsupported wallet backup"); } const candidate = parsed as EncryptedWallet & { format?: string }; if (candidate.format !== "xconfess-embedded-wallet" || !isEncryptedWallet(candidate)) throw new Error("Unsupported wallet backup"); localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate)); unlockEmbeddedWalletSession(); return candidate; }
