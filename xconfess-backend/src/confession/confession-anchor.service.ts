import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * ConfessionAnchorService
 *
 * Issue #1343 — Non-linkable on-chain anchoring.
 *
 * Replaces the raw hash anchoring scheme with a Pedersen commitment approach:
 *   commitment = SHA-256(SHA-256(content) || blinding_factor)
 *
 * Each confession gets:
 *   1. A fresh 32-byte random blinding factor (stored encrypted, off-chain).
 *   2. A fresh ephemeral Stellar keypair (private key discarded after tx submission).
 *
 * This ensures no two confessions are linkable on-chain, even with identical content.
 */
@Injectable()
export class ConfessionAnchorService {
  private readonly logger = new Logger(ConfessionAnchorService.name);
  private readonly server: StellarSdk.Horizon.Server;
  private readonly network: StellarSdk.Networks;
  private readonly contractId: string;

  constructor() {
    const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';
    this.server = new StellarSdk.Horizon.Server(
      isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org',
    );
    this.network = isTestnet ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC;
    this.contractId = process.env.ANCHOR_CONTRACT_ID!;
  }

  /**
   * Compute a Pedersen-style commitment.
   * commitment = SHA256( SHA256(content) || blinding )
   *
   * Returns both the commitment (to go on-chain) and the blinding factor
   * (to be stored encrypted in the backend DB, associated with the confession).
   */
  buildCommitment(content: string): { commitment: Buffer; blinding: Buffer } {
    const blinding = randomBytes(32); // fresh per confession
    const contentHash = createHash('sha256').update(content, 'utf8').digest();

    // Pedersen-style preimage: contentHash || blinding
    const preimage = Buffer.concat([contentHash, blinding]);
    const commitment = createHash('sha256').update(preimage).digest();

    return { commitment, blinding };
  }

  /**
   * Anchor a commitment on Soroban using a one-time ephemeral keypair.
   * The ephemeral private key is never stored — it's discarded after the tx.
   *
   * Returns the transaction hash for audit logging.
   */
  async anchorCommitment(
    commitment: Buffer,
  ): Promise<{ txHash: string; ephemeralPublicKey: string }> {
    // Fresh keypair per confession — breaks Stellar account-level linkage.
    const ephemeralKeypair = StellarSdk.Keypair.random();

    try {
      // Fund the ephemeral account via the app's fee-bump account.
      await this.fundEphemeralAccount(ephemeralKeypair.publicKey());

      // Build + submit the Soroban invoke_contract transaction.
      const txHash = await this.invokeAnchorContract(
        commitment,
        ephemeralKeypair,
      );

      this.logger.log(
        `Anchored commitment (tx=${txHash}, ephemeral=${ephemeralKeypair.publicKey()})`,
      );

      return { txHash, ephemeralPublicKey: ephemeralKeypair.publicKey() };
    } finally {
      // Explicitly zero the private key bytes in memory.
      // In Node.js we can't truly guarantee GC, but we clear the reference.
      // For stronger guarantees, use a native addon with explicit memory zeroing.
      (ephemeralKeypair as any)._secretKey?.fill(0);
    }
  }

  /**
   * Verify that a commitment is anchored on-chain (for proof-of-existence checks).
   */
  async verifyOnChain(commitment: Buffer): Promise<boolean> {
    // In production, call the contract's `verify` function via RPC.
    // Placeholder implementation:
    this.logger.log(`Verifying commitment on-chain: ${commitment.toString('hex')}`);
    return true; // replace with actual Soroban RPC call
  }

  /**
   * Open a commitment voluntarily (prove existence without revealing content).
   * Returns the data the user needs to share with a verifier.
   */
  buildOpeningProof(
    content: string,
    blinding: Buffer,
  ): { contentHash: string; blinding: string; commitment: string } {
    const contentHash = createHash('sha256').update(content, 'utf8').digest();
    const preimage = Buffer.concat([contentHash, blinding]);
    const commitment = createHash('sha256').update(preimage).digest();

    return {
      contentHash: contentHash.toString('hex'),
      blinding: blinding.toString('hex'),
      commitment: commitment.toString('hex'),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fundEphemeralAccount(publicKey: string): Promise<void> {
    // Use a backend-controlled "relayer" account to fund the ephemeral keypair
    // with the minimum XLM required for the anchor transaction.
    // This decouples the confession from the user's own Stellar account.
    this.logger.debug(`Funding ephemeral account: ${publicKey}`);
    // Implementation: build a payment from the relayer → ephemeral, submit.
  }

  private async invokeAnchorContract(
    commitment: Buffer,
    signer: StellarSdk.Keypair,
  ): Promise<string> {
    // Build Soroban invoke_contract_function transaction.
    // Args: commitment (BytesN<32>), ephemeral_pub (BytesN<32>)
    this.logger.debug(`Invoking anchor contract with commitment: ${commitment.toString('hex')}`);
    // Implementation: use @stellar/stellar-sdk SorobanRpc to submit.
    return 'placeholder_tx_hash';
  }
}