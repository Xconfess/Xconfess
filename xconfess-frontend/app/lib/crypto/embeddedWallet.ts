import { Keypair } from "@stellar/stellar-sdk";

const STORAGE_KEY = "xconfess.embedded-wallet.v1";
const PBKDF2_ITERATIONS = 310_000;

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)); return wallet;
}

export async function importEmbeddedWallet(secret: string, pin: string, network: EncryptedWallet["network"] = "testnet") {
  const keypair = Keypair.fromSecret(secret.trim()); const encrypted = await encryptSecret(keypair.secret(), pin);
  const wallet: EncryptedWallet = { version: 1, cipher: "AES-GCM", kdf: "PBKDF2-SHA-256", ...encrypted, publicKey: keypair.publicKey(), network, createdAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)); return wallet;
}

export function getEmbeddedWallet(): EncryptedWallet | null { const value = localStorage.getItem(STORAGE_KEY); if (!value) return null; try { return JSON.parse(value) as EncryptedWallet; } catch { return null; } }
export function removeEmbeddedWallet() { localStorage.removeItem(STORAGE_KEY); }
export async function unlockEmbeddedWallet(pin: string) { const wallet = getEmbeddedWallet(); if (!wallet) throw new Error("No embedded wallet found"); return Keypair.fromSecret(await decryptSecret(wallet, pin)); }
export async function changeEmbeddedWalletPin(currentPin: string, nextPin: string) {
  const wallet = getEmbeddedWallet();
  if (!wallet) throw new Error("No embedded wallet found");
  const secret = await decryptSecret(wallet, currentPin);
  const encrypted = await encryptSecret(secret, nextPin);
  const updated = { ...wallet, ...encrypted };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
export function exportEncryptedBackup() { const wallet = getEmbeddedWallet(); if (!wallet) throw new Error("No embedded wallet found"); return JSON.stringify({ format: "xconfess-embedded-wallet", ...wallet }, null, 2); }
export function importEncryptedBackup(payload: string) { const parsed = JSON.parse(payload) as EncryptedWallet & { format?: string }; if (parsed.format !== "xconfess-embedded-wallet" || parsed.version !== 1 || parsed.cipher !== "AES-GCM") throw new Error("Unsupported wallet backup"); localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); return parsed; }
