// src/config/stellar.config.ts
// Loads Stellar config from environment for NestJS ConfigModule
import { registerAs } from '@nestjs/config';

export default registerAs('stellar', () => ({
  network: process.env.STELLAR_NETWORK || 'testnet',
  horizonUrl:
    process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl:
    process.env.STELLAR_SOROBAN_RPC_URL ||
    'https://soroban-rpc-testnet.stellar.org',
  confessionAnchorContractId: process.env.CONFESSION_ANCHOR_CONTRACT_ID,
  reputationBadgesContractId: process.env.REPUTATION_BADGES_CONTRACT_ID,
  tippingSystemContractId: process.env.TIPPING_SYSTEM_CONTRACT_ID,
  serverSecret: process.env.STELLAR_SERVER_SECRET,

  // Fee guard and backoff settings
  maxFeeBudget: Number(process.env.STELLAR_MAX_FEE_BUDGET) || 100, // in stroops
  feeBackoffMs: Number(process.env.STELLAR_FEE_BACKOFF_MS) || 5000, // ms
  maxFeeRetries: Number(process.env.STELLAR_MAX_FEE_RETRIES) || 3,

  // RPC call timeout and retry settings
  rpcTimeoutMs: Number(process.env.STELLAR_RPC_TIMEOUT_MS) || 15000, // 15s default
  rpcMaxRetries: Number(process.env.STELLAR_RPC_MAX_RETRIES) || 3,
  rpcRetryBaseDelayMs: Number(process.env.STELLAR_RPC_RETRY_BASE_DELAY_MS) || 1000,
  rpcRetryMaxDelayMs: Number(process.env.STELLAR_RPC_RETRY_MAX_DELAY_MS) || 10000,
}));
