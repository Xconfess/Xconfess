import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const ANALYTICS_SCHEMA_VERSION = 1;

export const ANALYTICS_EVENT_NAMES = [
  'user_registered',
  'user_login',
  'confession_created',
  'comment_created',
  'reaction_created',
  'message_sent',
  'wallet_connected',
  'stellar_tx_submitted',
  'stellar_tx_confirmed',
  'stellar_tx_failed',
  'tip_completed',
  'soroban_event_indexed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_NETWORKS = ['testnet', 'mainnet'] as const;
export type AnalyticsNetwork = (typeof ANALYTICS_NETWORKS)[number];

@Entity('analytics_events')
@Index('idx_analytics_events_name_occurred', ['eventName', 'occurredAt'])
@Index('idx_analytics_events_actor_occurred', ['actorId', 'occurredAt'])
@Index('idx_analytics_events_tx_event', ['eventName', 'txHash'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_name', type: 'varchar', length: 64 })
  eventName!: AnalyticsEventName;

  @Column({ name: 'actor_id', type: 'varchar', length: 128, nullable: true })
  actorId!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamp with time zone' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 16, nullable: true })
  network!: AnalyticsNetwork | null;

  @Column({ name: 'asset_code', type: 'varchar', length: 16, nullable: true })
  assetCode!: string | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64, nullable: true })
  txHash!: string | null;

  @Column({ name: 'contract_id', type: 'varchar', length: 128, nullable: true })
  contractId!: string | null;

  @Column({ name: 'amount_atomic', type: 'varchar', length: 80, nullable: true })
  amountAtomic!: string | null;

  @Column({ name: 'schema_version', type: 'int', default: ANALYTICS_SCHEMA_VERSION })
  schemaVersion!: number;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160, nullable: true })
  @Index('uq_analytics_events_idempotency_key', { unique: true })
  idempotencyKey!: string | null;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson!: Record<string, string | number | boolean | null> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
