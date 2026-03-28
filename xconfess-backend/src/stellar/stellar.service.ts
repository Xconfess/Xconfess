import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarConfigService } from './stellar-config.service';
import { TransactionBuilderService } from './transaction-builder.service';
import { ITransactionResult } from './interfaces/stellar-config.interface';
import * as crypto from 'crypto';

export interface AnchorData {
  stellarTxHash: string;
  stellarHash: string;
  anchoredAt: Date;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly contractId: string;
  private readonly network: string;
  private readonly horizonUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private stellarConfig: StellarConfigService,
    private txBuilder: TransactionBuilderService,
  ) {
    this.contractId = this.configService.get<string>(
      'CONFESSION_ANCHOR_CONTRACT',
      'CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB',
    );
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
  }

  /**
   * Get account balance
   */
  async getAccountBalance(publicKey: string): Promise<{
    native: string;
    assets: Array<{ code: string; issuer: string; balance: string }>;
  }> {
    try {
      const server = this.stellarConfig.getServer();
      const account = await server.loadAccount(publicKey);
      const native =
        account.balances.find((b) => b.asset_type === 'native')?.balance || '0';
      const assets = account.balances
        .filter((b) => b.asset_type !== 'native')
        .map((b: any) => ({
          code: b.asset_code,
          issuer: b.asset_issuer,
          balance: b.balance,
        }));
      return { native, assets };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get account balance: ${message}`);
      throw new Error(`Account not found or network error: ${message}`);
    }
  }

  /**
   * Verify transaction on-chain (full result)
   */
  async verifyTransactionFull(txHash: string): Promise<ITransactionResult> {
    try {
      const server = this.stellarConfig.getServer();
      const tx = await server.transactions().transaction(txHash).call();
      return {
        hash: tx.hash,
        success: tx.successful,
        ledger: tx.ledger as any,
        createdAt: tx.created_at,
        envelope: tx.envelope_xdr,
        result: tx.result_xdr,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction verification failed: ${message}`);
      throw new Error(`Transaction not found: ${message}`);
    }
  }

  /**
   * Check if account exists
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      const server = this.stellarConfig.getServer();
      await server.loadAccount(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network configuration (safe for public exposure)
   */
  getNetworkConfig() {
    const config = this.stellarConfig.getConfig();
    return {
      network: config.network,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      contractIds: config.contractIds,
    };
  }

  /**
   * Send payment
   */
  async sendPayment(
    destinationPublicKey: string,
    amount: string,
    memo?: string,
  ): Promise<ITransactionResult> {
    try {
      const serverSecret = this.configService.get('STELLAR_SERVER_SECRET');
      if (!serverSecret) {
        throw new Error('Server secret key not configured');
      }
      const serverKeypair = StellarSDK.Keypair.fromSecret(serverSecret);
      const tx = await this.txBuilder.buildPaymentTransaction(
        serverKeypair.publicKey(),
        destinationPublicKey,
        amount,
        StellarSDK.Asset.native(),
        { memo },
      );
      const signedTx = this.txBuilder.signTransaction(tx, serverSecret);
      const result = await this.txBuilder.submitTransaction(signedTx);
      return {
        hash: result.hash,
        success: result.successful,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment failed: ${message}`);
      throw error;
    }
  }

  /**
   * Generate SHA-256 hash of confession content for anchoring
   */
  hashConfession(content: string, timestamp?: number): string {
    const ts = timestamp || Date.now();
    const payload = JSON.stringify({ content, timestamp: ts });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Validate a Stellar transaction hash format
   */
  isValidTxHash(txHash: string): boolean {
    if (!txHash || typeof txHash !== 'string') {
      return false;
    }
    return /^[a-fA-F0-9]{64}$/.test(txHash);
  }

  /**
   * Build the Stellar Explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string {
    const baseUrl =
      this.network === 'mainnet'
        ? 'https://stellar.expert/explorer/public/tx'
        : 'https://stellar.expert/explorer/testnet/tx';
    return `${baseUrl}/${txHash}`;
  }

  /**
   * Build the Horizon API URL for a transaction
   */
  getHorizonTxUrl(txHash: string): string {
    return `${this.horizonUrl}/transactions/${txHash}`;
  }

  /**
   * Verify a transaction exists on the Stellar network
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    if (!this.isValidTxHash(txHash)) {
      return false;
    }

    try {
      const response = await fetch(this.getHorizonTxUrl(txHash));
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.successful === true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error verifying Stellar transaction: ${message}`);
      return false;
    }
  }

  /**
   * Process anchoring data from frontend
   */
  processAnchorData(
    confessionContent: string,
    txHash: string,
    timestamp?: number,
  ): AnchorData | null {
    if (!this.isValidTxHash(txHash)) {
      return null;
    }

    const stellarHash = this.hashConfession(confessionContent, timestamp);

    return {
      stellarTxHash: txHash,
      stellarHash,
      anchoredAt: new Date(),
    };
  }

  /**
   * Get contract configuration info
   */
  getContractInfo(): {
    contractId: string;
    network: string;
    horizonUrl: string;
  } {
    return {
      contractId: this.contractId,
      network: this.network,
      horizonUrl: this.horizonUrl,
    };
  }
}
