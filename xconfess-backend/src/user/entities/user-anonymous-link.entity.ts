import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AnonymousUser } from './anonymous-user.entity';

@Entity('user_anonymous_users')
@Index(['userId'])
@Index(['anonymousUserId'])
@Index(['createdAt'])
export class UserAnonymousUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'anonymous_user_id', type: 'uuid' })
  anonymousUserId: string;

  @ManyToOne(() => AnonymousUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'anonymous_user_id' })
  anonymousUser: AnonymousUser;

  @CreateDateColumn()
  createdAt: Date;
}
