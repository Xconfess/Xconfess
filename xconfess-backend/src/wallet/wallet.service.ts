import { BadGatewayException, ConflictException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { RegisterWalletDto } from './dto/register-wallet.dto';
import { Wallet, WalletNetwork, WalletStatus } from './entities/wallet.entity';
import { WalletBackup } from './entities/wallet-backup.entity';

@Injectable()
export class WalletService {
  private readonly fundingRequests = new Map<number, number>();
  constructor(@InjectRepository(Wallet) private readonly repository: Repository<Wallet>, @InjectRepository(WalletBackup) private readonly backupRepository: Repository<WalletBackup>) {}

  async register(userId: number, dto: RegisterWalletDto) {
    try { Keypair.fromPublicKey(dto.publicKey); } catch { throw new ConflictException('Invalid Stellar public key'); }
    const existing = await this.repository.findOne({ where: [{ userId }, { publicKey: dto.publicKey }] });
    if (existing && existing.userId !== userId) throw new ConflictException('Wallet is already registered');
    if (existing) return existing;
    return this.repository.save(this.repository.create({ userId, publicKey: dto.publicKey, network: dto.network ?? WalletNetwork.TESTNET, status: WalletStatus.ACTIVE, lastSyncedAt: null }));
  }


  async fundTestnet(userId: number) {
    if (process.env.ENABLE_TESTNET_FUNDING !== 'true') throw new ForbiddenException('Testnet funding is disabled');
    const wallet = await this.getPrimary(userId);
    if (!wallet) throw new ConflictException('Register a wallet first');
    if (wallet.network !== WalletNetwork.TESTNET) throw new ForbiddenException('Friendbot is only available on Testnet');
    const lastRequest = this.fundingRequests.get(userId) ?? 0;
    if (Date.now() - lastRequest < 60 * 60 * 1000) throw new HttpException('Testnet funding can be requested once per hour', 429);
    const response = await fetch('https://friendbot.stellar.org?addr=' + encodeURIComponent(wallet.publicKey));
    if (!response.ok) throw new BadGatewayException('Testnet funding service unavailable');
    this.fundingRequests.set(userId, Date.now());
    return { funded: true, network: wallet.network, publicKey: wallet.publicKey };
  }

  async saveBackup(userId: number, dto: { walletId: string; encryptedPayload: string; encryptionVersion: number }) {
    const wallet = await this.repository.findOne({ where: { id: dto.walletId, userId } });
    if (!wallet) throw new ConflictException('Wallet not found');
    const existing = await this.backupRepository.findOne({ where: { walletId: wallet.id } });
    const backup = existing ?? this.backupRepository.create({ walletId: wallet.id });
    backup.encryptedPayload = dto.encryptedPayload;
    backup.encryptionVersion = dto.encryptionVersion;
    return this.backupRepository.save(backup);
  }

  async getBackup(userId: number) {
    const wallet = await this.getPrimary(userId);
    if (!wallet) throw new ConflictException('Wallet not found');
    return this.backupRepository.findOne({ where: { walletId: wallet.id } });
  }
  getPrimary(userId: number) { return this.repository.findOne({ where: { userId } }); }
}
