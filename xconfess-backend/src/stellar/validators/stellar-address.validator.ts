import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as StellarSDK from '@stellar/stellar-sdk';

@Injectable()
export class StellarAddressValidator {
  private readonly logger = new Logger(StellarAddressValidator.name);

  validateAccountId(address: string, context: string = 'account'): string {
    if (!address || typeof address !== 'string') {
      throw new BadRequestException(
        `Invalid ${context}: address must be a non-empty string`,
      );
    }

    const trimmed = address.trim();

    if (!trimmed) {
      throw new BadRequestException(
        `Invalid ${context}: address cannot be empty`,
      );
    }

    try {
      StellarSDK.Keypair.fromPublicKey(trimmed);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        message: `Failed to validate ${context}`,
        address: trimmed,
        error: msg,
      });
      throw new BadRequestException(
        `Invalid ${context}: malformed Stellar account address (${trimmed.substring(0, 10)}...)`,
      );
    }

    return trimmed;
  }

  validateContractId(contractId: string): string {
    if (!contractId || typeof contractId !== 'string') {
      throw new BadRequestException(
        'Invalid contract ID: must be a non-empty string',
      );
    }

    const trimmed = contractId.trim();

    if (!trimmed) {
      throw new BadRequestException(
        'Invalid contract ID: cannot be empty',
      );
    }

    const contractIdPattern = /^[A-Z2-7]{56}$/;
    if (!contractIdPattern.test(trimmed)) {
      throw new BadRequestException(
        `Invalid contract ID: must be a valid Soroban contract address (got ${trimmed.substring(0, 10)}...)`,
      );
    }

    try {
      const decoded = StellarSDK.StrKey.decodeContractId(trimmed);
      if (!decoded || decoded.length === 0) {
        throw new Error('Contract ID decode produced empty result');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        message: 'Failed to validate contract ID',
        contractId: trimmed,
        error: msg,
      });
      throw new BadRequestException(
        `Invalid contract ID: cannot decode address (${trimmed.substring(0, 10)}...)`,
      );
    }

    return trimmed;
  }

  validateMuxedAddress(muxedAddress: string): string {
    if (!muxedAddress || typeof muxedAddress !== 'string') {
      throw new BadRequestException(
        'Invalid muxed address: must be a non-empty string',
      );
    }

    const trimmed = muxedAddress.trim();

    if (!trimmed) {
      throw new BadRequestException(
        'Invalid muxed address: cannot be empty',
      );
    }

    try {
      const parsedMuxed = StellarSDK.MuxedAccount.parseMuxedAddress(trimmed);
      return parsedMuxed.accountId;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        message: 'Failed to validate muxed address',
        muxedAddress: trimmed,
        error: msg,
      });
      throw new BadRequestException(
        `Invalid muxed address: malformed format (${trimmed.substring(0, 10)}...)`,
      );
    }
  }

  validateTransactionHash(txHash: string): string {
    if (!txHash || typeof txHash !== 'string') {
      throw new BadRequestException(
        'Invalid transaction hash: must be a non-empty string',
      );
    }

    const trimmed = txHash.trim();
    const txHashPattern = /^[0-9a-fA-F]{64}$/;

    if (!txHashPattern.test(trimmed)) {
      throw new BadRequestException(
        `Invalid transaction hash: must be 64 hex characters (got ${trimmed.length})`,
      );
    }

    return trimmed.toLowerCase();
  }
}
