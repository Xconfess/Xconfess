import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TippingController } from './tipping.controller';
import { TippingService } from './tipping.service';
import { Tip } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarModule } from '../stellar/stellar.module';
import tippingConfig from '../config/tipping.config';
import { TipVerificationSlaService } from './tip-verification-sla.service';
import { ChainReconciliationService } from './chain-reconciliation.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    ConfigModule.forFeature(tippingConfig),
    TypeOrmModule.forFeature([Tip, AnonymousConfession]),
    StellarModule,
    AuditLogModule,
  ],
  controllers: [TippingController],
  providers: [TippingService, TipVerificationSlaService, ChainReconciliationService],
  exports: [TippingService, ChainReconciliationService],
})
export class TippingModule {}
