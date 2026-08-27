import {
  Module,
  NestModule,
  MiddlewareConsumer,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentController } from './comment.controller';
import { CommentAdminController } from './comment-admin.controller';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { AnonymousContextMiddleware } from '../middleware/anonymous-context.middleware';
import { ModerationComment } from './entities/moderation-comment.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comment,
      AnonymousConfession,
      ModerationComment,
      OutboxEvent,
    ]),
    AnalyticsModule,
    AuditLogModule,
    forwardRef(() => UserModule),
  ],
  controllers: [CommentController, CommentAdminController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AnonymousContextMiddleware).forRoutes('comments');
  }
}
