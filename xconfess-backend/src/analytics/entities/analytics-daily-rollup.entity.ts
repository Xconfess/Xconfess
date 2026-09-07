import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('analytics_daily_rollups')
export class AnalyticsDailyRollup {
  @PrimaryColumn({ type: 'date' })
  date!: string;

  @Column({ name: 'registered_users', type: 'int', default: 0 })
  registeredUsers!: number;

  @Column({ type: 'int', default: 0 })
  dau!: number;

  @Column({ name: 'confessions_created', type: 'int', default: 0 })
  confessionsCreated!: number;

  @Column({ name: 'comments_created', type: 'int', default: 0 })
  commentsCreated!: number;

  @Column({ name: 'reactions_created', type: 'int', default: 0 })
  reactionsCreated!: number;

  @Column({ name: 'messages_sent', type: 'int', default: 0 })
  messagesSent!: number;

  @Column({ name: 'wallets_connected', type: 'int', default: 0 })
  walletsConnected!: number;

  @Column({ name: 'stellar_tx_submitted', type: 'int', default: 0 })
  stellarTxSubmitted!: number;

  @Column({ name: 'stellar_tx_confirmed', type: 'int', default: 0 })
  stellarTxConfirmed!: number;

  @Column({ name: 'stellar_tx_failed', type: 'int', default: 0 })
  stellarTxFailed!: number;

  @Column({ name: 'tips_completed', type: 'int', default: 0 })
  tipsCompleted!: number;

  @Column({ name: 'tip_volume_xlm', type: 'decimal', precision: 30, scale: 7, default: 0 })
  tipVolumeXlm!: string;

  @Column({ name: 'tip_volume_usdc', type: 'decimal', precision: 30, scale: 7, default: 0 })
  tipVolumeUsdc!: string;

  @Column({ name: 'soroban_events_indexed', type: 'int', default: 0 })
  sorobanEventsIndexed!: number;
}
