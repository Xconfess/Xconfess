import {
  encryptConfession,
  decryptConfession,
  isEncryptedConfession,
  assertEncryptedBeforeSave,
  safeDecryptConfession,
} from './confession-encryption';

describe('Confession AES Encryption & Invariants', () => {
  const key = '12345678901234567890123456789012'; // 32 chars

  it('should encrypt and decrypt confession text correctly', () => {
    const text = 'This is a secret confession.';
    const encrypted = encryptConfession(text, key);
    const decrypted = decryptConfession(encrypted, key);
    expect(decrypted).toBe(text);
  });

  it('should produce different ciphertexts for same text (random IV)', () => {
    const text = 'Same confession';
    const encrypted1 = encryptConfession(text, key);
    const encrypted2 = encryptConfession(text, key);
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptConfession(encrypted1, key)).toBe(text);
    expect(decryptConfession(encrypted2, key)).toBe(text);
  });

  it('should throw error for invalid key length', () => {
    expect(() => encryptConfession('test', 'shortkey')).toThrow();
    expect(() => decryptConfession('invalid', 'shortkey')).toThrow();
  });

  it('should throw error when key is empty', () => {
    expect(() => encryptConfession('test', '')).toThrow();
    expect(() => decryptConfession('invalid', '')).toThrow();
  });

  describe('Invariant Checks: isEncryptedConfession & assertEncryptedBeforeSave', () => {
    it('should correctly identify encrypted vs plaintext content', () => {
      const plaintext = 'Raw unencrypted confession text';
      const encrypted = encryptConfession(plaintext, key);

      expect(isEncryptedConfession(encrypted)).toBe(true);
      expect(isEncryptedConfession(plaintext)).toBe(false);
      expect(isEncryptedConfession('invalid:format:extra')).toBe(false);
      expect(isEncryptedConfession('')).toBe(false);
    });

    it('assertEncryptedBeforeSave should pass for encrypted payload and throw for plaintext', () => {
      const plaintext = 'Plaintext content';
      const encrypted = encryptConfession(plaintext, key);

      expect(() => assertEncryptedBeforeSave(encrypted)).not.toThrow();
      expect(() => assertEncryptedBeforeSave(plaintext)).toThrow(
        /Security Invariant Violation/,
      );
    });
  });

  describe('safeDecryptConfession', () => {
    it('should safely decrypt valid ciphertext', () => {
      const original = 'Confidential message';
      const encrypted = encryptConfession(original, key);
      const decrypted = safeDecryptConfession(encrypted, key);
      expect(decrypted).toBe(original);
    });

    it('should throw error if attempting to decrypt plaintext or invalid payload', () => {
      expect(() =>
        safeDecryptConfession('Unencrypted text', key),
      ).toThrow(/not properly encrypted/);
    });
  });
});
