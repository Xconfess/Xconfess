import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reaction } from '../reaction/entities/reaction.entity';
import { Comment } from '../comment/entities/comment.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reaction, Comment, AnonymousUser])],
  providers: [AnomalyDetectionService],
  exports: [AnomalyDetectionService],
})
export class AnomalyDetectionModule {}
