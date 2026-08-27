import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { AnonymousUser } from '../../user/entities/anonymous-user.entity';
import { AnonymousConfession } from '../../confession/entities/confession.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AnonymousUser, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender: AnonymousUser;

  @ManyToOne(() => AnonymousConfession, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'confessionId' })
  confession: AnonymousConfession;

  @Column({ type: 'text' })
  content: string;

  /** True when content/replyContent are E2E ciphertext envelopes. */
  @Column({ default: true })
  isEncrypted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  hasReply: boolean;

  @Column({ type: 'text', nullable: true })
  replyContent: string | null;

  @Column({ type: 'timestamp', nullable: true })
  repliedAt: Date | null;

  // Timestamp when confession author read this thread message entry.
  @Column({ type: 'timestamp', nullable: true })
  authorReadAt: Date | null;

  // Timestamp when sender read the reply state for this thread message entry.
  @Column({ type: 'timestamp', nullable: true })
  senderReadAt: Date | null;
}
