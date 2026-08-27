import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfessionDraft } from './entities/confession-draft.entity';
import { ConfessionDraftService } from './confession-draft.service';
import { ConfessionDraftController } from './confession-draft.controller';
import { ConfessionModule } from '../confession/confession.module';
import { ConfessionDraftQueue } from './confession-draft.queue';

const jobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfessionDraft]),
    ConfessionModule,
    BullModule.registerQueue({ name: 'confession-draft-publisher' }),
  ],
  controllers: [ConfessionDraftController],
  providers: [ConfessionDraftService, ...(jobsEnabled ? [ConfessionDraftQueue] : [])],
  exports: [ConfessionDraftService],
})
export class ConfessionDraftModule {}
