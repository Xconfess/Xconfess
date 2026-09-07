import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('search_history')
@Index(['userId', 'queryHash'], { unique: true })
export class SearchHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', nullable: true })
  query: string;

  @Column({ type: 'jsonb' })
  filters: any;

  @Column({ name: 'query_hash', length: 64 })
  queryHash: string;

  @UpdateDateColumn({ name: 'used_at' })
  usedAt: Date;
}
