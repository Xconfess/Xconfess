import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ModerationEscalationService } from '../notifications/services/moderation-escalation.service';

interface HighSeverityEvent {
  confessionId: string;
  userId?: string;
  score: number;
  flags: string[];
}

interface RequiresReviewEvent {
  confessionId: string;
  userId?: string;
  score: number;
  flags: string[];
}

@Injectable()
export class ModerationEventsListener {
  private readonly logger = new Logger(ModerationEventsListener.name);

  constructor(
    private readonly escalationService: ModerationEscalationService,
  ) {}

  @OnEvent('moderation.high-severity')
  async handleHighSeverity(event: HighSeverityEvent) {
    this.logger.warn(
      `HIGH SEVERITY CONTENT DETECTED - Confession: ${event.confessionId}, ` +
        `Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
    );
    try {
      await this.escalationService.escalateHighSeverity(event);
    } catch (err: any) {
      this.logger.error(
        `Failed to escalate high-severity moderation event: ${err.message}`,
      );
      throw err;
    }
  }

  @OnEvent('moderation.requires-review')
  async handleRequiresReview(event: RequiresReviewEvent) {
    this.logger.log(
      `Content flagged for review - Confession: ${event.confessionId}, ` +
        `Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
    );
    try {
      await this.escalationService.escalateRequiresReview(event);
    } catch (err: any) {
      this.logger.error(
        `Failed to escalate requires-review moderation event: ${err.message}`,
      );
      throw err;
    }
  }
}