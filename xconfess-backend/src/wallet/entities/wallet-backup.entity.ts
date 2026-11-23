import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wallet_backups')
@Index(['walletId'], { unique: true })
export class WalletBackup {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) walletId!: string;
  @Column({ type: 'text' }) encryptedPayload!: string;
  @Column({ type: 'int', default: 1 }) encryptionVersion!: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
