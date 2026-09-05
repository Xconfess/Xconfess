import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Reaction } from '../reaction/entities/reaction.entity';
import { User } from '../user/entities/user.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { CacheModule } from '../cache/cache.module';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsDailyRollup } from './entities/analytics-daily-rollup.entity';
import { AnalyticsEventService } from './analytics-event.service';
import { TractionMetricsService } from './traction-metrics.service';
import { PublicTractionController } from './public-traction.controller';
import { Comment } from '../comment/entities/comment.entity';
import { Message } from '../messages/entities/message.entity';
import { Tip } from '../tipping/entities/tip.entity';
import { StellarAnchor } from '../stellar/entities/stellar-anchor.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnonymousConfession,
      Reaction,
      User,
      AnalyticsEvent,
      AnalyticsDailyRollup,
      Comment,
      Message,
      Tip,
      StellarAnchor,
    ]),
    CacheModule,
  ],
  controllers: [AnalyticsController, PublicTractionController],
  providers: [AnalyticsService, AnalyticsEventService, TractionMetricsService],
  exports: [AnalyticsService, AnalyticsEventService, TractionMetricsService],
})
export class AnalyticsModule {}
