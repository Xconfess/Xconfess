import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReactionService } from './reaction.service';
import { ReactionController } from './reaction.controller';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { Reaction } from './entities/reaction.entity';
import { ConfessionModule } from '../confession/confession.module';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WebSocketLogger } from '../websocket/websocket.logger';
import { ReactionsGateway } from './reactions.gateway';
import { WebSocketHealthController } from '../websocket/websocket-health.controller';
import { WebSocketHealthService } from '../websocket/websocket-health.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    forwardRef(() => ConfessionModule),
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      Reaction,
      AnonymousConfession,
      AnonymousUser,
      OutboxEvent,
    ]),
    AnalyticsModule,
  ],
  controllers: [ReactionController, WebSocketHealthController],
  providers: [ReactionService, WebSocketLogger, ReactionsGateway, WebSocketHealthService],
  exports: [ReactionService, ReactionsGateway],
})
export class ReactionModule {}
