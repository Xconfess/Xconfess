// src/stellar/interfaces/stellar-config.interface.ts
// Stellar configuration and types for network and contract integration

import type { ContractArg } from '../utils/parameter.encoder';

export enum StellarNetwork {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}

export interface IStellarConfig {
  network: StellarNetwork;
  horizonUrl: string;
  networkPassphrase: string;
  sorobanRpcUrl: string;
  contractIds: {
    confessionAnchor?: string;
    reputationBadges?: string;
    tippingSystem?: string;
  };
}

export interface ITransactionOptions {
  fee?: string;
  timebounds?: {
    minTime: number;
    maxTime: number;
  };
  memo?: string;
}

export interface IContractInvocation {
  contractId: string;
  functionName: string;
  args: ContractArg[];
  sourceAccount: string;
}

export interface ITransactionResult {
  hash: string;
  success: boolean;
  ledger?: number;
  createdAt?: string;
  envelope?: string;
  result?: any;
}
