import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { AnonymousContextMiddleware } from '../middleware/anonymous-context.middleware';
import { ModerationComment } from './entities/moderation-comment.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, ModerationComment, OutboxEvent]),
    AnalyticsModule,
  ],
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AnonymousContextMiddleware).forRoutes('comments');
  }
}
