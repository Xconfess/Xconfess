import { BadRequestException } from '@nestjs/common';
import * as StellarSDK from '@stellar/stellar-sdk';

export class StellarValidator {
  /**
   * Validates a Stellar public key/account identifier.
   * Throws BadRequestException if invalid.
   */
  static validatePublicKey(address: string, fieldName = 'address'): void {
    if (!address || typeof address !== 'string') {
      throw new BadRequestException(
        `${fieldName} is required and must be a string`,
      );
    }

    const trimmed = address.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${fieldName} cannot be empty`);
    }

    if (!StellarSDK.Keypair.isValidPublicKey(trimmed)) {
      throw new BadRequestException(
        `Invalid ${fieldName}. Expected a valid Stellar public key (G-prefixed, 56 characters).`,
      );
    }
  }

  /**
   * Validates a Soroban contract ID (C-prefixed StrKey format).
   * Throws BadRequestException if invalid.
   */
  static validateContractId(contractId: string, fieldName = 'contractId'): void {
    if (!contractId || typeof contractId !== 'string') {
      throw new BadRequestException(
        `${fieldName} is required and must be a string`,
      );
    }

    const trimmed = contractId.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${fieldName} cannot be empty`);
    }

    if (!trimmed.startsWith('C')) {
      throw new BadRequestException(
        `Invalid ${fieldName}. Soroban contract IDs must start with 'C'.`,
      );
    }

    try {
      const decoded = StellarSDK.StrKey.decodeContractId(trimmed);
      if (!decoded || decoded.length === 0) {
        throw new Error('Decoded contract ID is empty');
      }
    } catch {
      throw new BadRequestException(
        `Invalid ${fieldName}. Expected a valid Soroban contract ID.`,
      );
    }
  }

  /**
   * Validates a transaction hash (64-character hex string).
   * Throws BadRequestException if invalid.
   */
  static validateTransactionHash(txHash: string, fieldName = 'txHash'): void {
    if (!txHash || typeof txHash !== 'string') {
      throw new BadRequestException(
        `${fieldName} is required and must be a string`,
      );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(txHash.trim())) {
      throw new BadRequestException(
        `Invalid ${fieldName}. Expected a 64-character hex string.`,
      );
    }
  }

  /**
   * Validates a confession hash (32-byte hex).
   * Throws BadRequestException if invalid.
   */
  static validateConfessionHash(hash: string, fieldName = 'confessionHash'): void {
    if (!hash || typeof hash !== 'string') {
      throw new BadRequestException(
        `${fieldName} is required and must be a string`,
      );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(hash.trim())) {
      throw new BadRequestException(
        `Invalid ${fieldName}. Expected 32-byte hex (64 characters).`,
      );
    }
  }

  /**
   * Safe validation that returns a boolean instead of throwing.
   * Useful for conditional logic.
   */
  static isValidPublicKey(address: string): boolean {
    try {
      this.validatePublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safe validation that returns a boolean instead of throwing.
   */
  static isValidContractId(contractId: string): boolean {
    try {
      this.validateContractId(contractId);
      return true;
    } catch {
      return false;
    }
  }
}
