import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  Column,
} from 'typeorm';
import { AnonymousConfession } from '../../confession/entities/confession.entity';
import { Comment } from '../../comment/entities/comment.entity';
import { Reaction } from '../../reaction/entities/reaction.entity';
import { UserAnonymousUser } from './user-anonymous-link.entity';

@Entity()
export class AnonymousUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  /** X25519 public key (base64url) for E2E message encryption. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  messagePublicKey: string | null;

  /** Incremented when the client rotates keys (e.g. new device without backup). */
  @Column({ type: 'int', default: 0 })
  messageKeyVersion: number;

  /** Passphrase-wrapped private key backup; server cannot decrypt. */
  @Column({ type: 'text', nullable: true })
  encryptedKeyBackup: string | null;

  // Relations to anonymous actions
  @OneToMany(
    () => AnonymousConfession,
    (confession) => confession.anonymousUser,
  )
  confessions: AnonymousConfession[];

  @OneToMany(() => Comment, (comment) => comment.anonymousUser)
  comments: Comment[];

  @OneToMany(() => Reaction, (reaction) => reaction.anonymousUser)
  reactions: Reaction[];

  @OneToMany(() => UserAnonymousUser, (link) => link.anonymousUser)
  userLinks: UserAnonymousUser[];
}
