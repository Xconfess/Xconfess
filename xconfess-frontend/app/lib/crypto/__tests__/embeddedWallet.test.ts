import { decryptSecret, encryptSecret } from '../embeddedWallet';
import { webcrypto } from 'node:crypto';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('embedded wallet encryption', () => {
  it('round-trips a Stellar secret without storing plaintext in the envelope', async () => {
    const secret = 'SAMPLE-SECRET-MATERIAL';
    const encrypted = await encryptSecret(secret, '246810');
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(await decryptSecret({ version: 1, cipher: 'AES-GCM', kdf: 'PBKDF2-SHA-256', ...encrypted, publicKey: 'GTESTPUBLICKEY', network: 'testnet', createdAt: new Date().toISOString() }, '246810')).toBe(secret);
  });

  it('rejects a wrong PIN', async () => {
    const encrypted = await encryptSecret('secret-material', '246810');
    await expect(decryptSecret({ version: 1, cipher: 'AES-GCM', kdf: 'PBKDF2-SHA-256', ...encrypted, publicKey: 'GTEST', network: 'testnet', createdAt: new Date().toISOString() }, '000000')).rejects.toThrow('Incorrect wallet PIN');
  });

  it('rejects weak PINs before encrypting', async () => {
    await expect(encryptSecret('secret-material', '123')).rejects.toThrow('6–12 digits');
  });

  it('rejects predictable PINs before encrypting', async () => {
    await expect(encryptSecret('secret-material', '000000')).rejects.toThrow('less predictable');
  });
});



