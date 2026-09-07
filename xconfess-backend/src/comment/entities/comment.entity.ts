import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from "typeorm";
import { AnonymousConfession } from "../../confession/entities/confession.entity";
import { AnonymousUser } from "../../user/entities/anonymous-user.entity";

@Entity("comments")
@Index(["confession", "createdAt", "id"])
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => AnonymousUser, (anonymousUser) => anonymousUser.comments)
  @JoinColumn({ name: "anonymous_user_id" })
  anonymousUser: AnonymousUser;

  @ManyToOne(() => AnonymousConfession, (c) => c.comments)
  @JoinColumn({ name: "confessionId" })
  confession: AnonymousConfession;

  @Column({ type: 'varchar', nullable: true })
  anonymousContextId?: string;

  // Parent comment (optional) for one-level nested replies
  @ManyToOne(() => Comment, (comment) => comment.replies, { nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent?: Comment;

  @OneToMany(() => Comment, (comment) => comment.parent)
  replies?: Comment[];

  @RelationId((comment: Comment) => comment.parent)
  parentId?: number;

  // Soft-delete: keeps the row so replies stay attached.
  // Content is replaced with "[deleted]" on delete.
  @Column({ default: false })
  isDeleted: boolean;

  // Tracks whether the comment has been edited (for 5-minute edit window UI).
  @Column({ type: "timestamp", nullable: true })
  editedAt?: Date;

  // Extracted @mention usernames stored for notification lookup.
  @Column("simple-array", { nullable: true })
  mentionedUsernames?: string[];

  // Client-supplied idempotency key for replay safety.
  // Unique index ensures only one comment per key.
  @Column({ type: "varchar", nullable: true })
  @Index({ unique: true })
  idempotencyKey?: string;
}
