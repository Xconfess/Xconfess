import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum WalletNetwork { TESTNET = 'TESTNET', MAINNET = 'MAINNET' }
export enum WalletStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', DISABLED = 'DISABLED' }

@Entity('wallets')
@Index(['userId'], { unique: true })
@Index(['publicKey'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'int' }) userId!: number;
  @Column({ type: 'varchar', length: 56 }) publicKey!: string;
  @Column({ type: 'enum', enum: WalletNetwork, default: WalletNetwork.TESTNET }) network!: WalletNetwork;
  @Column({ type: 'varchar', length: 32, default: 'XCONFESS_EMBEDDED' }) walletType!: string;
  @Column({ type: 'enum', enum: WalletStatus, default: WalletStatus.ACTIVE }) status!: WalletStatus;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
  @Column({ type: 'timestamp', nullable: true }) lastSyncedAt!: Date | null;
}
