import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEventService } from '../analytics/analytics-event.service';
import { AnalyticsNetwork } from '../analytics/entities/analytics-event.entity';
import { SorobanEventCheckpoint } from './entities/soroban-event-checkpoint.entity';

export interface RecordSorobanEventInput {
  network: AnalyticsNetwork;
  contractId: string;
  ledger: number;
  cursor?: string | null;
  txHash?: string | null;
  eventTopic?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordSorobanFailureInput {
  network: AnalyticsNetwork;
  contractId: string;
  errorCode: string;
}

export interface SorobanIndexerSummary {
  checkpoints: number;
  indexedEvents: number;
  failedEvents: number;
  lastIndexedAt: string | null;
  lastErrorAt: string | null;
}

const VALID_NETWORKS = new Set<AnalyticsNetwork>(['testnet', 'mainnet']);
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

@Injectable()
export class SorobanEventCheckpointService {
  private readonly logger = new Logger(SorobanEventCheckpointService.name);

  constructor(
    @InjectRepository(SorobanEventCheckpoint)
    private readonly checkpointRepository: Repository<SorobanEventCheckpoint>,
    @Optional()
    private readonly analyticsEventService?: AnalyticsEventService,
  ) {}

  async recordIndexedEvent(input: RecordSorobanEventInput): Promise<void> {
    this.assertValidInput(input);

    await this.checkpointRepository.query(
      `
        INSERT INTO "soroban_event_checkpoints" (
          "network",
          "contract_id",
          "last_ledger",
          "last_cursor",
          "indexed_events",
          "failed_events",
          "last_error_code",
          "last_error_at",
          "last_indexed_at",
          "created_at",
          "updated_at"
        )
        VALUES ($1, $2, $3, $4, 1, 0, NULL, NULL, now(), now(), now())
        ON CONFLICT ("network", "contract_id")
        DO UPDATE SET
          "last_ledger" = GREATEST("soroban_event_checkpoints"."last_ledger", EXCLUDED."last_ledger"),
          "last_cursor" = CASE
            WHEN EXCLUDED."last_ledger" >= "soroban_event_checkpoints"."last_ledger"
            THEN EXCLUDED."last_cursor"
            ELSE "soroban_event_checkpoints"."last_cursor"
          END,
          "indexed_events" = "soroban_event_checkpoints"."indexed_events" + 1,
          "last_error_code" = NULL,
          "last_indexed_at" = now(),
          "updated_at" = now()
      `,
      [input.network, input.contractId, input.ledger, input.cursor ?? null],
    );

    await this.analyticsEventService
      ?.record({
        eventName: 'soroban_event_indexed',
        network: input.network,
        txHash: input.txHash ?? null,
        contractId: input.contractId,
        idempotencyKey:
          input.idempotencyKey ??
          `soroban_event_indexed:${input.contractId}:${input.ledger}:${input.cursor ?? 'no-cursor'}`,
        metadata: {
          source: 'soroban_event_checkpoint',
          state: 'indexed',
        },
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to record Soroban index analytics: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  async recordFailure(input: RecordSorobanFailureInput): Promise<void> {
    this.assertValidNetwork(input.network);
    this.assertValidContractId(input.contractId);

    const errorCode = input.errorCode.replace(/[^A-Z0-9_]/gi, '_').slice(0, 64);
    if (!errorCode) {
      throw new BadRequestException('Soroban index failure requires errorCode');
    }

    await this.checkpointRepository.query(
      `
        INSERT INTO "soroban_event_checkpoints" (
          "network",
          "contract_id",
          "last_ledger",
          "last_cursor",
          "indexed_events",
          "failed_events",
          "last_error_code",
          "last_error_at",
          "last_indexed_at",
          "created_at",
          "updated_at"
        )
        VALUES ($1, $2, 0, NULL, 0, 1, $3, now(), NULL, now(), now())
        ON CONFLICT ("network", "contract_id")
        DO UPDATE SET
          "failed_events" = "soroban_event_checkpoints"."failed_events" + 1,
          "last_error_code" = EXCLUDED."last_error_code",
          "last_error_at" = now(),
          "updated_at" = now()
      `,
      [input.network, input.contractId, errorCode],
    );
  }

  async getCheckpoint(
    network: AnalyticsNetwork,
    contractId: string,
  ): Promise<SorobanEventCheckpoint | null> {
    this.assertValidNetwork(network);
    this.assertValidContractId(contractId);
    return this.checkpointRepository.findOne({ where: { network, contractId } });
  }

  async getSummary(): Promise<SorobanIndexerSummary> {
    const checkpoints = await this.checkpointRepository.find({
      select: {
        indexedEvents: true,
        failedEvents: true,
        lastIndexedAt: true,
        lastErrorAt: true,
      },
    });

    return checkpoints.reduce<SorobanIndexerSummary>(
      (summary, checkpoint) => ({
        checkpoints: summary.checkpoints + 1,
        indexedEvents: summary.indexedEvents + checkpoint.indexedEvents,
        failedEvents: summary.failedEvents + checkpoint.failedEvents,
        lastIndexedAt: this.maxIso(summary.lastIndexedAt, checkpoint.lastIndexedAt),
        lastErrorAt: this.maxIso(summary.lastErrorAt, checkpoint.lastErrorAt),
      }),
      {
        checkpoints: 0,
        indexedEvents: 0,
        failedEvents: 0,
        lastIndexedAt: null,
        lastErrorAt: null,
      },
    );
  }

  private assertValidInput(input: RecordSorobanEventInput): void {
    this.assertValidNetwork(input.network);
    this.assertValidContractId(input.contractId);

    if (!Number.isSafeInteger(input.ledger) || input.ledger < 0) {
      throw new BadRequestException('Soroban event ledger must be a safe integer');
    }

    if (input.cursor !== undefined && input.cursor !== null && input.cursor.length > 256) {
      throw new BadRequestException('Soroban event cursor exceeds 256 characters');
    }
  }

  private assertValidNetwork(network: string): void {
    if (!VALID_NETWORKS.has(network as AnalyticsNetwork)) {
      throw new BadRequestException('Unsupported Stellar network');
    }
  }

  private assertValidContractId(contractId: string): void {
    if (!CONTRACT_ID_PATTERN.test(contractId)) {
      throw new BadRequestException('Invalid Soroban contract ID');
    }
  }

  private maxIso(current: string | null, next: Date | null): string | null {
    if (!next) {
      return current;
    }
    const nextIso = next.toISOString();
    if (!current || nextIso > current) {
      return nextIso;
    }
    return current;
  }
}
