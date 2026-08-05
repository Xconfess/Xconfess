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
  lastChangedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  lastChangedAt: Date;

  @Column({ type: 'json', nullable: true })
  rollbackMetadata: {
    previousState: {
      name: string;
      description?: string;
      enabled: boolean;
      percentage: number;
      userIds: string[];
      lastChangedBy?: string;
      lastChangedAt?: Date;
    };
    timestamp: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
