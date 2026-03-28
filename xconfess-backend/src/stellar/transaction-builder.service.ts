// src/stellar/transaction-builder.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarConfigService } from './stellar-config.service';
import { ITransactionOptions } from './interfaces/stellar-config.interface';

@Injectable()
export class TransactionBuilderService {
  private readonly logger = new Logger(TransactionBuilderService.name);

  constructor(private stellarConfig: StellarConfigService) {}

  /**
   * Build a Stellar transaction with operations
   * Applies fee budget checks and backoff if fees exceed policy
   */
  async buildTransaction(
    sourcePublicKey: string,
    operations: any[],
    options?: ITransactionOptions,
  ): Promise<any> {
    const maxFee = this.stellarConfig.getConfig().maxFeeBudget;
    const feeBackoffMs = this.stellarConfig.getConfig().feeBackoffMs;
    const maxRetries = this.stellarConfig.getConfig().maxFeeRetries;

    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      // Estimate fee
      const feeEstimate = parseInt(await this.estimateFee(operations.length));
      if (feeEstimate > maxFee) {
        if (attempt > maxRetries) {
          const msg = `Transaction fee ${feeEstimate} exceeds max fee budget ${maxFee} after ${maxRetries} retries`;
          this.logger.warn(msg);
          throw new Error(msg);
        }

        this.logger.warn(
          `Transaction fee ${feeEstimate} exceeds max budget ${maxFee}. Backing off for ${feeBackoffMs}ms (attempt ${attempt})`,
        );
        await new Promise((res) => setTimeout(res, feeBackoffMs));
        continue;
      }

      try {
        // Load source account
        const server = this.stellarConfig.getServer();
        const sourceAccount = await server.loadAccount(sourcePublicKey);

        const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
          fee: options?.fee || feeEstimate.toString(),
          networkPassphrase: this.stellarConfig.getNetwork(),
        });

        operations.forEach((op) => txBuilder.addOperation(op));

        if (options?.memo) {
          txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
        }

        if (options?.timebounds) {
          txBuilder.setTimeout(options.timebounds.maxTime);
        } else {
          txBuilder.setTimeout(300);
        }

        return txBuilder.build();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to build transaction on attempt ${attempt}: ${message}`,
        );
        if (attempt >= maxRetries) {
          throw new Error(
            `Transaction build failed after ${attempt} attempts: ${message}`,
          );
        }
        await new Promise((res) => setTimeout(res, feeBackoffMs));
      }
    }
  }

  /**
   * Build a payment transaction
   */
  async buildPaymentTransaction(
    sourcePublicKey: string,
    destinationPublicKey: string,
    amount: string,
    asset: any = StellarSDK.Asset.native(),
    options?: ITransactionOptions,
  ): Promise<any> {
    const paymentOp = StellarSDK.Operation.payment({
      destination: destinationPublicKey,
      asset,
      amount,
    });

    return this.buildTransaction(sourcePublicKey, [paymentOp], options);
  }

  /**
   * Sign transaction with secret key
   */
  signTransaction(transaction: any, secretKey: string): any {
    try {
      const keypair = StellarSDK.Keypair.fromSecret(secretKey);
      transaction.sign(keypair);
      return transaction;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sign transaction: ${message}`);
      throw new Error(`Transaction signing failed: ${message}`);
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(operationsCount: number): Promise<string> {
    try {
      const server = this.stellarConfig.getServer();
      const feeStats = await server.feeStats();
      const baseFee = (feeStats as any).fee_charged.mode || StellarSDK.BASE_FEE;
      return (parseInt(baseFee) * operationsCount).toString();
    } catch {
      return (parseInt(StellarSDK.BASE_FEE) * operationsCount).toString();
    }
  }

  /**
   * Submit transaction to network
   */
  async submitTransaction(transaction: any): Promise<any> {
    try {
      const server = this.stellarConfig.getServer();
      const result = await server.submitTransaction(transaction);
      this.logger.log(`Transaction submitted: ${result.hash}`);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction submission failed: ${message}`);
      const withResponse = error as {
        response?: { data?: { extras?: { result_codes?: unknown } } };
      };
      if (withResponse.response?.data?.extras?.result_codes) {
        const codes = withResponse.response.data.extras.result_codes;
        throw new Error(`Transaction failed: ${JSON.stringify(codes)}`);
      }
      throw new Error(`Transaction submission failed: ${message}`);
    }
  }
}