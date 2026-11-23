import { BadRequestException } from '@nestjs/common';
import { StellarValidator } from './stellar-validator';

describe('StellarValidator', () => {
  describe('validatePublicKey', () => {
    it('accepts valid Stellar public keys', () => {
      const validKeys = [
        'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJOMB52XSBTBNZWAY2O7LQMJX',
        'GBPV4UNQZUGUQTJ3QVWVG63CPEKQ3K35ZDB5SJMX5BCFUYDMCKZ7M3D',
      ];

      for (const key of validKeys) {
        expect(() => StellarValidator.validatePublicKey(key)).not.toThrow();
      }
    });

    it('rejects malformed public keys', () => {
      const invalidKeys = [
        'GBPV4UNQZUGUQTJ3QVWVG63CPEKQ3K35ZDB5SJMX5BCFUYDMCKZ7M3', // Too short
        'CBPV4UNQZUGUQTJ3QVWVG63CPEKQ3K35ZDB5SJMX5BCFUYDMCKZ7M3D', // Starts with C (contract)
        'not-a-key',
        '',
        '   ',
      ];

      for (const key of invalidKeys) {
        expect(() => StellarValidator.validatePublicKey(key)).toThrow(
          BadRequestException,
        );
      }
    });

    it('uses custom field name in error message', () => {
      expect(() => StellarValidator.validatePublicKey('invalid', 'wallet')).toThrow(
        /wallet/,
      );
    });

    it('rejects null or undefined', () => {
      expect(() => StellarValidator.validatePublicKey(null as any)).toThrow(
        BadRequestException,
      );
      expect(() => StellarValidator.validatePublicKey(undefined as any)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateContractId', () => {
    it('accepts valid Soroban contract IDs', () => {
      const validContracts = [
        'CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB',
        'CBPV4UNQZUGUQTJ3QVWVG63CPEKQ3K35ZDB5SJMX5BCFUYDMCKZ7M3D',
      ];

      for (const id of validContracts) {
        expect(() => StellarValidator.validateContractId(id)).not.toThrow();
      }
    });

    it('rejects non-contract identifiers', () => {
      expect(() =>
        StellarValidator.validateContractId(
          'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJOMB52XSBTBNZWAY2O7LQMJX',
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects empty or whitespace strings', () => {
      expect(() => StellarValidator.validateContractId('')).toThrow(
        BadRequestException,
      );
      expect(() => StellarValidator.validateContractId('   ')).toThrow(
        BadRequestException,
      );
    });

    it('uses custom field name in error message', () => {
      expect(() => StellarValidator.validateContractId('invalid', 'sorobanId')).toThrow(
        /sorobanId/,
      );
    });
  });

  describe('validateTransactionHash', () => {
    it('accepts valid 64-character hex strings', () => {
      const validHashes = [
        '0000000000000000000000000000000000000000000000000000000000000000',
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
      ];

      for (const hash of validHashes) {
        expect(() => StellarValidator.validateTransactionHash(hash)).not.toThrow();
      }
    });

    it('rejects non-hex characters', () => {
      const invalidHashes = [
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
        'g000000000000000000000000000000000000000000000000000000000000000',
      ];

      for (const hash of invalidHashes) {
        expect(() => StellarValidator.validateTransactionHash(hash)).toThrow(
          BadRequestException,
        );
      }
    });

    it('rejects wrong length', () => {
      expect(() =>
        StellarValidator.validateTransactionHash(
          '0000000000000000000000000000000000000000000000000000000000000',
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        StellarValidator.validateTransactionHash(
          '00000000000000000000000000000000000000000000000000000000000000000',
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('validateConfessionHash', () => {
    it('accepts valid 32-byte hex (64 characters)', () => {
      expect(() =>
        StellarValidator.validateConfessionHash(
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        ),
      ).not.toThrow();
    });

    it('rejects non-hex or wrong length', () => {
      expect(() =>
        StellarValidator.validateConfessionHash('not-a-valid-hash'),
      ).toThrow(BadRequestException);
      expect(() => StellarValidator.validateConfessionHash('0123')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Safe validation methods', () => {
    describe('isValidPublicKey', () => {
      it('returns true for valid keys', () => {
        expect(
          StellarValidator.isValidPublicKey(
            'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJOMB52XSBTBNZWAY2O7LQMJX',
          ),
        ).toBe(true);
      });

      it('returns false for invalid keys without throwing', () => {
        expect(StellarValidator.isValidPublicKey('invalid')).toBe(false);
        expect(StellarValidator.isValidPublicKey('')).toBe(false);
        expect(StellarValidator.isValidPublicKey(null as any)).toBe(false);
      });
    });

    describe('isValidContractId', () => {
      it('returns true for valid contract IDs', () => {
        expect(
          StellarValidator.isValidContractId(
            'CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB',
          ),
        ).toBe(true);
      });

      it('returns false for invalid contract IDs without throwing', () => {
        expect(StellarValidator.isValidContractId('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJOMB52XSBTBNZWAY2O7LQMJX')).toBe(
          false,
        );
        expect(StellarValidator.isValidContractId('invalid')).toBe(false);
      });
    });
  });
});
