import { Injectable, Logger, Optional } from 'nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { StellarConfigService } from '../../stellar/stellar-config.service';
import { DeploymentMetadataService } from '../../stellar/services/deployment-metadata.service';
import { StellarAnchor, AnchorStatus } from '../../stellar/entities/stellar-anchor.entity';
import { Tip, TipVerificationStatus } from '../../tipping/entities/tip.entity';
import { SorobanEventCheckpoint } from '../../stellar/entities/soroban-event-checkpoint.entity';
import {
  SorobanEventCheckpointService,
  SorobanIndexerSummary,
} from '../../stellar/soroban-event-checkpoint.service';

export type HorizonStatus = 'ok' | 'degraded' | 'unreachable';

export interface StellarDiagnosticsResult {
  network: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  contractIds: {
    confessionAnchor: string | null;
    reputationBadges: string | null;
    tippingSystem: string | null;
  };
  horizonStatus: HorizonStatus;
  horizonLatencyMs: number | null;
  deploymentMetadata: {
    loaded: boolean;
    generatedAtUtc: string | null;
    isStale: boolean;
    ageDays: number | null;
    loadError: string | null;
  };
  staleAnchorCount: number;
  pendingTipCount: number;
  staleTipCount: number;
  sorobanIndexer: SorobanIndexerSummary;
  checkedAt: string;
}

@Injectable()
export class StellarDiagnosticsService {
  private readonly logger = new Logger(StellarDiagnosticsService.name);

  constructor(
    private readonly stellarConfigService: StellarConfigService,
    private readonly deploymentMetadataService: DeploymentMetadataService,
    @Optional()
    @InjectRepository(StellarAnchor)
    private readonly anchorRepository?: Repository<StellarAnchor>,
    @Optional()
    @InjectRepository(Tip)
    private readonly tipRepository?: Repository<Tip>,
    @Optional()
    @InjectRepository(SorobanEventCheckpoint)
    private readonly checkpointRepository?: Repository<SorobanEventCheckpoint>,
    @Optional()
    private readonly sorobanEventCheckpointService?: SorobanEventCheckpointService,
  ) {}

  async getDiagnostics(): Promise<StellarDiagnosticsResult> {
    const config = this.stellarConfigService.getConfig();
    const metadataFreshness = this.deploymentMetadataService.getMetadataFreshness();

    const { status: horizonStatus, latencyMs: horizonLatencyMs } =
      await this.pingHorizon(config.horizonUrl);

    let staleAnchorCount = 0;
    let pendingTipCount = 0;
    let staleTipCount = 0;
    let sorobanIndexer: SorobanIndexerSummary = {
      checkpoints: 0,
      indexedEvents: 0,
      failedEvents: 0,
      lastIndexedAt: null,
      lastErrorAt: null,
    };
    if (this.anchorRepository) {
      try {
        const SLA_MINUTES = 30;
        const staleThreshold = new Date(Date.now() - SLA_MINUTES * 60 * 1000);
        staleAnchorCount = await this.anchorRepository.count({
          where: {
            status: AnchorStatus.PENDING,
            createdAt: LessThan(staleThreshold),
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to count stale anchors: ${msg}`);
      }
    }

    if (this.tipRepository) {
      try {
        [pendingTipCount, staleTipCount] = await Promise.all([
          this.tipRepository.count({
            where: {
              verificationStatus: In([
                TipVerificationStatus.PENDING,
                TipVerificationStatus.STALE_PENDING,
              ]),
            },
          }),
          this.tipRepository.count({
            where: { verificationStatus: TipVerificationStatus.STALE_PENDING },
          }),
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to count pending tips: ${msg}`);
      }
    }

    if (this.sorobanEventCheckpointService && this.checkpointRepository) {
      try {
        sorobanIndexer =
          await this.sorobanEventCheckpointService.getSummary();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to summarize Soroban indexer state: ${msg}`);
      }
    }

    return {
      network: config.network,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      contractIds: {
        confessionAnchor: config.contractIds.confessionAnchor ?? null,
        reputationBadges: config.contractIds.reputationBadges ?? null,
        tippingSystem: config.contractIds.tippingSystem ?? null,
      },
      horizonStatus,
      horizonLatencyMs,
      deploymentMetadata: {
        loaded: !!this.deploymentMetadataService.getMetadata(),
        generatedAtUtc: metadataFreshness.generatedAtUtc,
        isStale: metadataFreshness.isStale,
        ageDays:
          metadataFreshness.daysSinceGezeration >= 0
            ? metadataFreshness.daysSinceGezeration
            : null,
        loadError: this.deploymentMetadataService.getLoadError(),
      },
      staleAnchorCount,
      pendingTipCount,
      staleTipCount,
      sorobanIndexer,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Lightweight Horizon liveness check — hits GET / on the Horizon base URL.
   * Never throws; returns 'unreachable' or 'degraded' on failure so callers
   * can surface a warning state rather than a 500.
   */
  private async pingHorizon(
    horizonUrl: string,
  ): Promise<{ status: HorizonStatus; latencyMs: number | null }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(horizonUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { status: 'ok', latencyMs };
      }

      this.logger.warn(`Horizon ping returned HTTP ${response.status} from ${horizonUrl}`);
      return { status: 'degraded', latencyMs };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Horizon ping failed for ${horizonUrl}: ${message}`);
      return { status: 'unreachable', latencyMs };
    }
  }
}
