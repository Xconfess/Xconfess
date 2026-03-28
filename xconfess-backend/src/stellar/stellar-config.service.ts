// src/stellar/stellar-config.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import {
  IStellarConfig,
  StellarNetwork,
} from './interfaces/stellar-config.interface';

@Injectable()
export class StellarConfigService {
  private readonly logger = new Logger(StellarConfigService.name);
  private config: IStellarConfig & {
    maxFeeBudget: number;
    feeBackoffMs: number;
    maxFeeRetries: number;
  };
  private server: StellarSDK.Horizon.Server;

  constructor(private configService: ConfigService) {
    this.initializeConfig();
  }

  private initializeConfig() {
    // Validate network
    const network = this.configService.get<StellarNetwork>(
      'STELLAR_NETWORK',
      StellarNetwork.TESTNET,
    );
    if (!Object.values(StellarNetwork).includes(network)) {
      throw new Error(`Invalid network: ${network}`);
    }

    // Load fee/backoff policy
    const maxFeeBudget = Number(
      this.configService.get('STELLAR_MAX_FEE_BUDGET') ?? 100,
    );
    const feeBackoffMs = Number(
      this.configService.get('STELLAR_FEE_BACKOFF_MS') ?? 5000,
    );
    const maxFeeRetries = Number(
      this.configService.get('STELLAR_MAX_FEE_RETRIES') ?? 3,
    );

    // Build config
    this.config = {
      network,
      horizonUrl: this.getHorizonUrl(network),
      networkPassphrase: this.getNetworkPassphrase(network),
      sorobanRpcUrl: this.getSorobanRpcUrl(network),
      contractIds: {
        confessionAnchor: this.configService.get(
          'CONFESSION_ANCHOR_CONTRACT_ID',
        ),
        reputationBadges: this.configService.get(
          'REPUTATION_BADGES_CONTRACT_ID',
        ),
        tippingSystem: this.configService.get('TIPPING_SYSTEM_CONTRACT_ID'),
      },
      maxFeeBudget,
      feeBackoffMs,
      maxFeeRetries,
    };

    // Initialize Horizon server
    this.server = new StellarSDK.Horizon.Server(this.config.horizonUrl);

    this.logger.log(`Stellar configured for ${network}`);
    this.logger.log(`Horizon URL: ${this.config.horizonUrl}`);
    this.logger.log(
      `Fee budget: ${maxFeeBudget}, Backoff: ${feeBackoffMs}ms, Max retries: ${maxFeeRetries}`,
    );
  }

  getConfig() {
    return { ...this.config };
  }

  getServer(): StellarSDK.Horizon.Server {
    return this.server;
  }

  getNetwork(): string {
    return this.config.network === StellarNetwork.MAINNET
      ? StellarSDK.Networks.PUBLIC
      : StellarSDK.Networks.TESTNET;
  }

  private getHorizonUrl(network: StellarNetwork): string {
    return network === StellarNetwork.MAINNET
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
  }

  private getNetworkPassphrase(network: StellarNetwork): string {
    return network === StellarNetwork.MAINNET
      ? StellarSDK.Networks.PUBLIC
      : StellarSDK.Networks.TESTNET;
  }

  private getSorobanRpcUrl(network: StellarNetwork): string {
    return network === StellarNetwork.MAINNET
      ? 'https://soroban-rpc.stellar.org'
      : 'https://soroban-rpc-testnet.stellar.org';
  }

  isMainnet(): boolean {
    return this.config.network === StellarNetwork.MAINNET;
  }

  getContractId(
    contractName: 'confessionAnchor' | 'reputationBadges' | 'tippingSystem',
  ): string {
    const id = this.config.contractIds[contractName];
    if (!id) {
      throw new Error(`Contract ID for ${contractName} not configured`);
    }
    return id;
  }
}
