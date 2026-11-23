import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StellarAddressValidator } from './stellar-address.validator';
import * as StellarSDK from '@stellar/stellar-sdk';

describe('StellarAddressValidator', () => {
  let validator: StellarAddressValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarAddressValidator],
    }).compile();

    validator = module.get<StellarAddressValidator>(StellarAddressValidator);
  });

  describe('validateAccountId', () => {
    it('should accept a valid public key', () => {
      const keypair = StellarSDK.Keypair.random();
      const result = validator.validateAccountId(keypair.publicKey());
      expect(result).toBe(keypair.publicKey());
    });

    it('should reject null or undefined', () => {
      expect(() => validator.validateAccountId(null as any)).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateAccountId(undefined as any)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty string', () => {
      expect(() => validator.validateAccountId('')).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateAccountId('   ')).toThrow(
        BadRequestException,
      );
    });

    it('should reject malformed address', () => {
      expect(() => validator.validateAccountId('INVALID')).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateAccountId('G' + 'A'.repeat(55))).toThrow(
        BadRequestException,
      );
    });

    it('should trim whitespace from valid address', () => {
      const keypair = StellarSDK.Keypair.random();
      const result = validator.validateAccountId(`  ${keypair.publicKey()}  `);
      expect(result).toBe(keypair.publicKey());
    });

    it('should reject non-string input', () => {
      expect(() => validator.validateAccountId(123 as any)).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateAccountId({} as any)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateContractId', () => {
    it('should accept a valid contract ID', () => {
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const result = validator.validateContractId(contractId);
      expect(result).toBe(contractId);
    });

    it('should reject null or undefined', () => {
      expect(() => validator.validateContractId(null as any)).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateContractId(undefined as any)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty string', () => {
      expect(() => validator.validateContractId('')).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateContractId('   ')).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid contract ID format', () => {
      expect(() => validator.validateContractId('INVALID')).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateContractId('C' + 'A'.repeat(55))).toThrow(
        BadRequestException,
      );
    });

    it('should reject wrong prefix', () => {
      expect(() =>
        validator.validateContractId('G' + 'A'.repeat(55)),
      ).toThrow(BadRequestException);
    });

    it('should trim whitespace from valid contract ID', () => {
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const result = validator.validateContractId(`  ${contractId}  `);
      expect(result).toBe(contractId);
    });
  });

  describe('validateMuxedAddress', () => {
    it('should accept a valid public key as muxed address', () => {
      const keypair = StellarSDK.Keypair.random();
      const result = validator.validateMuxedAddress(keypair.publicKey());
      expect(result).toBe(keypair.publicKey());
    });

    it('should extract account ID from muxed address', () => {
      const keypair = StellarSDK.Keypair.random();
      const muxedAddress = new StellarSDK.MuxedAccount(keypair.publicKey(), '123');
      const result = validator.validateMuxedAddress(muxedAddress.accountId);
      expect(result).toBe(keypair.publicKey());
    });

    it('should reject invalid muxed address', () => {
      expect(() => validator.validateMuxedAddress('INVALID')).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateMuxedAddress('')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateTransactionHash', () => {
    it('should accept valid transaction hash', () => {
      const txHash = 'a'.repeat(64);
      const result = validator.validateTransactionHash(txHash);
      expect(result).toBe(txHash);
    });

    it('should accept uppercase transaction hash', () => {
      const txHash = 'A'.repeat(64);
      const result = validator.validateTransactionHash(txHash);
      expect(result).toBe(txHash.toLowerCase());
    });

    it('should accept mixed case transaction hash and normalize', () => {
      const txHash = 'aAbBcCdDeEfF' + '0'.repeat(52);
      const result = validator.validateTransactionHash(txHash);
      expect(result).toBe(txHash.toLowerCase());
    });

    it('should reject invalid length', () => {
      expect(() => validator.validateTransactionHash('a'.repeat(63))).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateTransactionHash('a'.repeat(65))).toThrow(
        BadRequestException,
      );
    });

    it('should reject non-hex characters', () => {
      expect(() => validator.validateTransactionHash('g' + 'a'.repeat(63))).toThrow(
        BadRequestException,
      );
      expect(() => validator.validateTransactionHash('a'.repeat(63) + ' ')).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty string', () => {
      expect(() => validator.validateTransactionHash('')).toThrow(
        BadRequestException,
      );
    });

    it('should trim whitespace', () => {
      const txHash = 'a'.repeat(64);
      const result = validator.validateTransactionHash(`  ${txHash}  `);
      expect(result).toBe(txHash);
    });
  });
});
