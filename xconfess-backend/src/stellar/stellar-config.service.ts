// src/stellar/stellar-config.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import {
  IStellarConfig,
  StellarNetwork,
} from './interfaces/stellar-config.interface';
import {
  DeploymentMetadata,
  DeploymentMetadataService,
} from './services/deployment-metadata.service';

@Injectable()
export class StellarConfigService implements OnModuleInit {
  private readonly logger = new Logger(StellarConfigService.name);
  private config: IStellarConfig & {
    maxFeeBudget: number;
    feeBackoffMs: number;
    maxFeeRetries: number;
    rpcTimeoutMs: number;
    rpcMaxRetries: number;
    rpcRetryBaseDelayMs: number;
    rpcRetryMaxDelayMs: number;
  };
  private server: StellarSDK.Horizon.Server;

  /** Maps a configured contract field to its deployment metadata contract name. */
  private readonly contractMetadataKeys: Record<
    keyof IStellarConfig['contractIds'],
    string
  > = {
    confessionAnchor: 'confession-anchor',
    reputationBadges: 'reputation-badges',
    tippingSystem: 'anonymous-tipping',
  };

  constructor(
    private configService: ConfigService,
    private deploymentMetadataService: DeploymentMetadataService,
  ) {
    this.initializeConfig();
  }

  onModuleInit(): void {
    this.applyDeploymentMetadataFallback();
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

    // Load RPC timeout and retry policy
    const rpcTimeoutMs = Number(
      this.configService.get('STELLAR_RPC_TIMEOUT_MS') ?? 15000,
    );
    const rpcMaxRetries = Number(
      this.configService.get('STELLAR_RPC_MAX_RETRIES') ?? 3,
    );
    const rpcRetryBaseDelayMs = Number(
      this.configService.get('STELLAR_RPC_RETRY_BASE_DELAY_MS') ?? 1000,
    );
    const rpcRetryMaxDelayMs = Number(
      this.configService.get('STELLAR_RPC_RETRY_MAX_DELAY_MS') ?? 10000,
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
      rpcTimeoutMs,
      rpcMaxRetries,
      rpcRetryBaseDelayMs,
      rpcRetryMaxDelayMs,
    };

    // Initialize Horizon server
    this.server = new StellarSDK.Horizon.Server(this.config.horizonUrl);

    this.logger.log(`Stellar configured for ${network}`);
    this.logger.log(`Horizon URL: ${this.config.horizonUrl}`);
    this.logger.log(
      `Fee budget: ${maxFeeBudget}, Backoff: ${feeBackoffMs}ms, Max retries: ${maxFeeRetries}`,
    );
    this.logger.log(
      `RPC timeout: ${rpcTimeoutMs}ms, RPC retries: ${rpcMaxRetries}, Retry backoff: ${rpcRetryBaseDelayMs}-${rpcRetryMaxDelayMs}ms`,
    );
  }

  private applyDeploymentMetadataFallback(): void {
    const metadata = this.deploymentMetadataService.getMetadata();
    if (!metadata) {
      this.logger.warn(
        'Deployment metadata not available for fallback contract IDs',
      );
    }

    const fallbackIds = this.deploymentMetadataService.getAllContractIds();
    const explicitContractIds = { ...this.config.contractIds };
    this.config.contractIds = {
      confessionAnchor:
        explicitContractIds.confessionAnchor || fallbackIds['confession-anchor'],
      reputationBadges:
        explicitContractIds.reputationBadges || fallbackIds['reputation-badges'],
      tippingSystem:
        explicitContractIds.tippingSystem || fallbackIds['anonymous-tipping'],
    };

    const featuresEnabled =
      this.configService.get<string>('STELLAR_FEATURES_ENABLED') === 'true';

    if (featuresEnabled && metadata) {
      this.validateContractIdsAgainstNetwork(metadata, explicitContractIds);
    }

    const missingContractIds = Object.entries(this.config.contractIds)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (featuresEnabled && missingContractIds.length > 0) {
      throw new Error(
        `Stellar features are enabled but missing contract IDs: ${missingContractIds.join(
          ', ',
        )}. Provide contract IDs through environment variables or deployment metadata.
        `,
      );
    }
  }

  /**
   * Ensure deployment metadata belongs to the configured network, and that any
   * explicitly-configured (env var) contract ID agrees with that network's
   * deployment metadata. Prevents e.g. a testnet config accidentally loading
   * mainnet deployment metadata, or an env var left over from another network.
   */
  private validateContractIdsAgainstNetwork(
    metadata: DeploymentMetadata,
    explicitContractIds: IStellarConfig['contractIds'],
  ): void {
    if (metadata.network !== this.config.network) {
      throw new Error(
        `Deployment metadata network mismatch: configured Stellar network is "${this.config.network}" but the loaded deployment metadata was generated for "${metadata.network}". Refusing to boot with mismatched network deployment metadata.`,
      );
    }

    const mismatches = (
      Object.keys(explicitContractIds) as Array<keyof IStellarConfig['contractIds']>
    ).filter((field) => {
      const explicitId = explicitContractIds[field];
      const metadataId = metadata.contracts[this.contractMetadataKeys[field]]?.contract_id;
      return !!explicitId && !!metadataId && explicitId !== metadataId;
    });

    if (mismatches.length > 0) {
      throw new Error(
        `Stellar contract ID mismatch for network "${this.config.network}": ${mismatches.join(
          ', ',
        )} do not match the ID recorded in deployment metadata. Verify contract ID environment variables are configured for the correct network.`,
      );
    }
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
