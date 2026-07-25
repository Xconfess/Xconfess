// src/confession/entities/confession.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Reaction } from '../../reaction/entities/reaction.entity';
import { AnonymousUser } from '../../user/entities/anonymous-user.entity';
import { Gender } from '../dto/get-confessions.dto';
import { Comment } from '../../comment/entities/comment.entity';
import { ConfessionTag } from './confession-tag.entity';

@Entity('anonymous_confessions')
@Unique(['stellarTxHash'])
export class AnonymousConfession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  @Index()
  message: string;

  @Column({
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  gender: Gender;

  @OneToMany(() => Reaction, (reaction) => reaction.confession)
  reactions: Reaction[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  /**
   * Owner relation - use anonymousUser, NOT user.
   * The confession entity defines owner relation as anonymousUser.
   * Always use confession.anonymousUser for ownership checks and relation loading.
   */
  @Column({ name: 'anonymous_user_id' })
  anonymousUserId: string;

  @ManyToOne(
    () => AnonymousUser,
    (anonymousUser) => anonymousUser.confessions,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'anonymous_user_id' })
  anonymousUser: AnonymousUser;

  @Column({ type: 'int', default: 0 })
  view_count: number;

  @Column({ default: false })
  isDeleted: boolean;
  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'varchar', nullable: true })
  deletedBy: string | null;

  @OneToMany(() => Comment, (comment) => comment.confession)
  comments: Comment[];

  @OneToMany(() => ConfessionTag, (confessionTag) => confessionTag.confession)
  confessionTags: ConfessionTag[];

  // Moderation fields
  @Column('decimal', {
    name: 'moderation_score',
    precision: 5,
    scale: 4,
    default: 0,
  })
  moderationScore: number;

  @Index({ unique: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  idempotencyKey?: string | null;

  @Column('simple-array', { name: 'moderation_flags', default: '' })
  moderationFlags: string[];

  @Column({
    type: 'varchar',
    name: 'moderation_status',
    default: 'pending',
  })
  moderationStatus: string;

  @Column({ name: 'requires_review', default: false })
  requiresReview: boolean;

  @Column({ name: 'is_hidden', default: false })
  isHidden: boolean;

  @Column('json', { name: 'moderation_details', nullable: true })
  moderationDetails: Record<string, number>;

  // Stellar blockchain anchoring fields
  @Column({ name: 'stellar_tx_hash', nullable: true, unique: true })
  stellarTxHash: string;

  @Column({ name: 'stellar_hash', nullable: true })
  stellarHash: string;

  @Column({ name: 'is_anchored', default: false })
  isAnchored: boolean;

  @Column({ name: 'anchored_at', type: 'timestamp', nullable: true })
  anchoredAt: Date;

  // Full-text search vector
  @Column({ type: 'tsvector', nullable: true })
  search_vector: string;

  // Scheduling fields
  @Column({ type: 'varchar', default: 'published' })
  status: string; // 'draft', 'scheduled', 'published'

  @Column({ name: 'publish_at', type: 'timestamp', nullable: true })
  publishAt: Date | null;

  // Envelope encryption columns for key rotation
  @Column({ name: 'encrypted_content', type: 'text', nullable: true })
  encryptedContent: string | null;

  @Column({ name: 'wrapped_dek', type: 'text', nullable: true })
  wrappedDek: string | null;

  @Column({ name: 'key_version', type: 'varchar', length: 16, nullable: true, default: 'v1' })
  keyVersion: string | null;

  @Column({ name: 'migration_status', type: 'varchar', length: 32, nullable: true })
  migrationStatus: string | null;

  @Column({ name: 'legacy_ciphertext', type: 'text', nullable: true })
  legacyCiphertext: string | null;

  get content(): string {
    return this.message;
  }
}
