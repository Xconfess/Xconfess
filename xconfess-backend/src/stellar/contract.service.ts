import { Injectable, Logger } from '@nestjs/common';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarConfigService } from './stellar-config.service';
import { TransactionBuilderService } from './transaction-builder.service';
import {
  IContractInvocation,
  ITransactionResult,
} from './interfaces/stellar-config.interface';
import { handleStellarError } from './utils/stellar-error.handler';
import { encodeContractArgs, ContractArg } from './utils/parameter.encoder';
import { InvokeContractDto } from './dto/invoke-contract.dto';
import { getStellarInvocationPolicy } from './stellar-invocation-policy';

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    private stellarConfig: StellarConfigService,
    private txBuilder: TransactionBuilderService,
  ) {}

  /**
   * Map an allowlisted HTTP DTO to a low-level invocation. Contract id and
   * function name are never taken from the client — only from this mapping.
   */
  invocationFromAllowlistedDto(
    dto: InvokeContractDto,
    verifiedSignerPublicKey: string,
  ): IContractInvocation {
    const policy = getStellarInvocationPolicy(dto.operation);

    if (!policy) {
      throw new Error(`Unhandled allowlisted operation: ${dto.operation}`);
    }

    switch (policy.operation) {
      case 'anchor_confession':
        return {
          contractId: this.stellarConfig.getContractId(policy.contractName),
          functionName: policy.functionName,
          args: [
            { type: 'bytes', value: Buffer.from(dto.confessionHash!, 'hex') },
            { type: 'u64', value: dto.timestamp! },
          ],
          sourceAccount: verifiedSignerPublicKey,
        };
      default: {
        const _never: never = policy.operation;
        throw new Error(`Unhandled allowlisted operation: ${String(_never)}`);
      }
    }
  }

  /**
   * Invoke a Soroban contract function.
   * All argument encoding is delegated to parameter.encoder.ts — there is no
   * duplicate encoding logic in this class.
   */
  async invokeContract(
    invocation: IContractInvocation,
    signerSecret: string,
  ): Promise<ITransactionResult> {
    try {
      const contract = new StellarSDK.Contract(invocation.contractId);

      // Single encoding path — delegates to parameter.encoder.ts
      const encodedArgs = encodeContractArgs(invocation.args);

      const operation = contract.call(invocation.functionName, ...encodedArgs);

      const tx = await this.txBuilder.buildTransaction(
        invocation.sourceAccount,
        [operation],
      );
      const signedTx = this.txBuilder.signTransaction(tx, signerSecret);
      const result: ITransactionResult =
        await this.txBuilder.submitTransaction(signedTx);
      const decodedResult = this.decodeContractResult(result);

      return {
        hash: result.hash,
        success: result.success,
        result: decodedResult,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Contract invocation failed: ' + String(message));
      throw handleStellarError(error);
    }
  }

  /**
   * Anchor a confession hash on-chain.
   * Args are expressed as typed ContractArg objects and encoded by the shared encoder.
   */
  async anchorConfession(
    confessionHash: string,
    timestamp: number,
    signerSecret: string,
  ): Promise<ITransactionResult> {
    const contractId = this.stellarConfig.getContractId('confessionAnchor');
    const signerKeypair = StellarSDK.Keypair.fromSecret(signerSecret);

    return this.invokeContract(
      {
        contractId,
        functionName: 'anchor_confession',
        args: [
          { type: 'bytes', value: Buffer.from(confessionHash, 'hex') },
          { type: 'u64', value: timestamp },
        ] satisfies ContractArg[],
        sourceAccount: signerKeypair.publicKey(),
      },
      signerSecret,
    );
  }

  /**
   * Verify a confession hash on-chain (read-only — no transaction).
   */
  async verifyConfession(confessionHash: string): Promise<number | null> {
    try {
      const contractId = this.stellarConfig.getContractId('confessionAnchor');
      const contract = new StellarSDK.Contract(contractId);

      const result = await contract.call(
        'verify_confession',
        StellarSDK.nativeToScVal(confessionHash, { type: 'bytes' }),
      );

      const timestamp = StellarSDK.scValToNative(result as any);
      return timestamp || null;
    } catch (_error) {
      this.logger.warn(
        'Confession not found on-chain: ' + String(confessionHash),
      );
      return null;
    }
  }

  /**
   * Decode a contract result XDR into a native JS value.
   */
  private decodeContractResult(result: any): any {
    try {
      if (!result.result_xdr) return null;
      const xdr = StellarSDK.xdr.TransactionResult.fromXDR(
        result.result_xdr,
        'base64',
      );
      const resultValue = xdr.result().value();
      return StellarSDK.scValToNative(resultValue as any);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Could not decode contract result: ' + String(message));
      return null;
    }
  }
}
