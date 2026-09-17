import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimitGuard } from '../auth/guard/rate-limit.guard';
import { Wallet } from './entities/wallet.entity';
import { WalletBackup } from './entities/wallet-backup.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({ imports: [TypeOrmModule.forFeature([Wallet, WalletBackup])], controllers: [WalletController], providers: [WalletService, RateLimitGuard], exports: [WalletService] })
export class WalletModule {}

