const originalEnv = process.env.EMAIL_ENCRYPTION_KEY;
process.env.EMAIL_ENCRYPTION_KEY = '12345678901234567890123456789012';

import { CryptoUtil } from './crypto.util';

describe('CryptoUtil', () => {
  afterAll(() => {
    process.env.EMAIL_ENCRYPTION_KEY = originalEnv;
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const text = 'test@example.com';
      const { encrypted, iv, tag } = CryptoUtil.encrypt(text);

      expect(encrypted).toBeDefined();
      expect(iv).toBeDefined();
      expect(tag).toBeDefined();

      const decrypted = CryptoUtil.decrypt(encrypted, iv, tag);
      expect(decrypted).toBe(text);
    });

    it('should produce different ciphertexts for same input', () => {
      const text = 'same@email.com';
      const result1 = CryptoUtil.encrypt(text);
      const result2 = CryptoUtil.encrypt(text);

      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(
        CryptoUtil.decrypt(result1.encrypted, result1.iv, result1.tag),
      ).toBe(text);
      expect(
        CryptoUtil.decrypt(result2.encrypted, result2.iv, result2.tag),
      ).toBe(text);
    });
  });

  describe('hash', () => {
    it('should produce consistent hash for same input', () => {
      const text = 'test@example.com';
      const hash1 = CryptoUtil.hash(text);
      const hash2 = CryptoUtil.hash(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = CryptoUtil.hash('a@example.com');
      const hash2 = CryptoUtil.hash('b@example.com');

      expect(hash1).not.toBe(hash2);
    });
  });
});
