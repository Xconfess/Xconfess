import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  percentage: number;

  @Column({ type: 'simple-array', nullable: true })
  userIds: string[];

  @Column({ type: 'varchar', nullable: true })
  lastChangedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastChangedAt: Date | null;

  /**
   * Snapshot of the flag's state immediately before the most recent update,
   * so a single rollback() call can restore it without a separate audit lookup.
   */
  @Column({ type: 'json', nullable: true })
  rollbackMetadata: {
    previousState: {
      name: string;
      description: string;
      enabled: boolean;
      percentage: number;
      userIds: string[];
      lastChangedBy: string | null;
      lastChangedAt: Date | null;
    };
    timestamp: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
