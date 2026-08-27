import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface ContractMetadata {
  contract_id: string;
  sha256: string;
  source: string;
  version: string;
  wasm_file: string;
}

export interface DeploymentMetadata {
  contracts: Record<string, ContractMetadata>;
  generated_at_utc: string;
  network: string;
  target: string;
}

@Injectable()
export class DeploymentMetadataService implements OnModuleInit {
  private readonly logger = new Logger(DeploymentMetadataService.name);
  private deploymentMetadata: DeploymentMetadata | null = null;
  private metadataLoadError: string | null = null;
  private readonly deploymentMetadataPath: string;
  private lastLoadTime: Date | null = null;

  constructor(private configService: ConfigService) {
    // Determine deployment metadata path
    // Default to deployments/testnet.json relative to project root
    const env = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.deploymentMetadataPath = this.configService.get<string>(
      'DEPLOYMENT_METADATA_PATH',
      path.resolve(process.cwd(), '..', '..', 'deployments', `${env}.json`),
    );
  }

  /**
   * Load deployment metadata on module initialization
   */
  onModuleInit(): void {
    this.loadMetadata();
  }

  /**
   * Load deployment metadata from file
   */
  private loadMetadata(): void {
    try {
      if (!fs.existsSync(this.deploymentMetadataPath)) {
        this.metadataLoadError = `Deployment metadata file not found: ${this.deploymentMetadataPath}`;
        this.logger.warn(this.metadataLoadError);
        return;
      }

      const rawData = fs.readFileSync(this.deploymentMetadataPath, 'utf-8');
      this.deploymentMetadata = JSON.parse(rawData) as DeploymentMetadata;
      this.lastLoadTime = new Date();
      this.metadataLoadError = null;

      // Log success
      const contractNames = Object.keys(this.deploymentMetadata.contracts || {});
      this.logger.log(
        `Loaded deployment metadata for ${contractNames.length} contracts on ${this.deploymentMetadata.network}`,
      );

      // Validate metadata freshness (warn if > 30 days old)
      this.validateMetadataFreshness();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.metadataLoadError = `Failed to load deployment metadata: ${message}`;
      this.logger.error(this.metadataLoadError);
    }
  }

  /**
   * Validate metadata freshness
   */
  private validateMetadataFreshness(): void {
    if (!this.deploymentMetadata) return;

    try {
      const generatedAt = new Date(this.deploymentMetadata.generated_at_utc);
      const now = new Date();
      const daysSinceGeneration = Math.floor(
        (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceGeneration > 30) {
        this.logger.warn(
          `Deployment metadata is ${daysSinceGeneration} days old. Consider re-deploying.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        'Could not validate deployment metadata freshness: invalid timestamp',
      );
    }
  }

  /**
   * Get deployment metadata
   */
  getMetadata(): DeploymentMetadata | null {
    return this.deploymentMetadata;
  }

  /**
   * Get metadata load error (if any)
   */
  getLoadError(): string | null {
    return this.metadataLoadError;
  }

  /**
   * Get contract ID from deployment metadata
   */
  getContractId(contractName: string): string | null {
    if (!this.deploymentMetadata) return null;
    return this.deploymentMetadata.contracts[contractName]?.contract_id ?? null;
  }

  /**
   * Get all contract IDs
   */
  getAllContractIds(): Record<string, string> {
    const result: Record<string, string> = {};
    if (!this.deploymentMetadata) return result;

    for (const [name, metadata] of Object.entries(
      this.deploymentMetadata.contracts,
    )) {
      result[name] = metadata.contract_id;
    }
    return result;
  }

  /**
   * Check metadata freshness status
   */
  getMetadataFreshness(): {
    isStale: boolean;
    daysSinceGeneration: number;
    generatedAtUtc: string | null;
  } {
    if (!this.deploymentMetadata) {
      return { isStale: true, daysSinceGeneration: -1, generatedAtUtc: null };
    }

    try {
      const generatedAt = new Date(this.deploymentMetadata.generated_at_utc);
      const now = new Date();
      const daysSinceGeneration = Math.floor(
        (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const isStale = daysSinceGeneration > 30; // Stale if > 30 days

      return {
        isStale,
        daysSinceGeneration,
        generatedAtUtc: this.deploymentMetadata.generated_at_utc,
      };
    } catch (error) {
      return { isStale: true, daysSinceGeneration: -1, generatedAtUtc: null };
    }
  }

  /**
   * Reload metadata from file (for testing/updates)
   */
  reloadMetadata(): void {
    this.logger.log('Reloading deployment metadata...');
    this.loadMetadata();
  }
}
