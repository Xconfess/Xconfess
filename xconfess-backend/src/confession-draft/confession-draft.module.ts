import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfessionDraft } from './entities/confession-draft.entity';
import { ConfessionDraftService } from './confession-draft.service';
import { ConfessionDraftController } from './confession-draft.controller';
import { ConfessionModule } from '../confession/confession.module';
import {
  CONFESSION_DRAFT_QUEUE,
  ConfessionDraftQueue,
} from './confession-draft.queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfessionDraft]),
    ConfessionModule,
    BullModule.registerQueue({ name: CONFESSION_DRAFT_QUEUE }),
  ],
  controllers: [ConfessionDraftController],
  providers: [ConfessionDraftService, ConfessionDraftQueue],
  exports: [ConfessionDraftService],
})
export class ConfessionDraftModule {}
