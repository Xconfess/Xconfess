import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { AnonymousConfession } from '../../confession/entities/confession.entity';

@Entity('bookmarks')
@Unique(['userId', 'confessionId'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: number;

  @Column({ name: 'confession_id' })
  confessionId: string;

  @ManyToOne(() => AnonymousConfession, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'confession_id' })
  confession: AnonymousConfession;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
