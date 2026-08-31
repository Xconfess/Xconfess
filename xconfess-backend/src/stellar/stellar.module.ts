import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarConfigService } from './stellar-config.service';
import { TransactionBuilderService } from './transaction-builder.service';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { StellarController } from './stellar.controller';
import { StellarInvokeContractGuard } from './guards/stellar-invoke-contract.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DeploymentMetadataService } from './services/deployment-metadata.service';
import { StellarReconciliationWorker } from './stellar-reconciliation.worker';
import { ReputationReconciliationWorker } from './reputation-reconciliation.worker';
import { StellarAnchor } from './entities/stellar-anchor.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { Tip } from '../tipping/entities/tip.entity';

@Module({
  imports: [
    ConfigModule,
    AuditLogModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([StellarAnchor, AnonymousConfession, Tip]),
  ],
  providers: [
    StellarConfigService,
    TransactionBuilderService,
    StellarService,
    ContractService,
    StellarInvokeContractGuard,
    DeploymentMetadataService,
    StellarReconciliationWorker,
    ReputationReconciliationWorker,
  ],
  controllers: [StellarController],
  exports: [
    StellarConfigService,
    TransactionBuilderService,
    StellarService,
    ContractService,
    DeploymentMetadataService,
  ],
})
export class StellarModule {}
