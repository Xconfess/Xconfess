import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('soroban_event_checkpoints')
@Unique('uq_soroban_event_checkpoint_network_contract', [
  'network',
  'contractId',
])
@Index('idx_soroban_event_checkpoints_last_indexed', ['lastIndexedAt'])
export class SorobanEventCheckpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  network!: 'testnet' | 'mainnet';

  @Column({ name: 'contract_id', type: 'varchar', length: 56 })
  contractId!: string;

  @Column({ name: 'last_ledger', type: 'bigint', default: 0 })
  lastLedger!: string;

  @Column({ name: 'last_cursor', type: 'varchar', length: 256, nullable: true })
  lastCursor!: string | null;

  @Column({ name: 'indexed_events', type: 'integer', default: 0 })
  indexedEvents!: number;

  @Column({ name: 'failed_events', type: 'integer', default: 0 })
  failedEvents!: number;

  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  lastErrorCode!: string | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt!: Date | null;

  @Column({ name: 'last_indexed_at', type: 'timestamptz', nullable: true })
  lastIndexedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
