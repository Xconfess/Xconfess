import { Injectable, TooManyRequestsException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Message } from './entities/message.entity';

export interface ThrottleConfig {
  windowMs: number;
  maxMessages: number;
}

export interface ThrottleStatus {
  isThrottled: boolean;
  remaining: number;
  resetTime: Date | null;
  messagesSentInWindow: number;
}

@Injectable()
export class MessageThrottleService {
  private readonly logger = new Logger(MessageThrottleService.name);
  private readonly defaultConfig: ThrottleConfig = {
    windowMs: 60 * 1000, // 1 minute
    maxMessages: 5,
  };

  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  private generateThrottleKey(
    senderId: string,
    confessionId: string,
  ): string {
    return `${senderId}:${confessionId}`;
  }

  async checkAndRecordMessage(
    senderId: string,
    confessionId: string,
    config: ThrottleConfig = this.defaultConfig,
  ): Promise<ThrottleStatus> {
    const throttleKey = this.generateThrottleKey(senderId, confessionId);
    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);

    // Count messages in current window
    const count = await this.messageRepository.count({
      where: {
        throttleKey,
        rateLimitWindow: new Date(now.getTime() - config.windowMs),
      },
    });

    const isThrottled = count >= config.maxMessages;
    const remaining = Math.max(0, config.maxMessages - count);

    if (isThrottled) {
      this.logger.warn(
        `Throttling triggered for ${throttleKey}: ${count}/${config.maxMessages} messages`,
      );
    }

    return {
      isThrottled,
      remaining,
      resetTime: new Date(now.getTime() + config.windowMs),
      messagesSentInWindow: count,
    };
  }

  async enforceThrottle(
    senderId: string,
    confessionId: string,
    config: ThrottleConfig = this.defaultConfig,
  ): Promise<void> {
    const status = await this.checkAndRecordMessage(
      senderId,
      confessionId,
      config,
    );

    if (status.isThrottled) {
      const resetTime = status.resetTime
        ? Math.ceil((status.resetTime.getTime() - Date.now()) / 1000)
        : 60;

      throw new TooManyRequestsException(
        `Too many messages. Please try again in ${resetTime} seconds.`,
      );
    }
  }

  async recordMessageWithThrottle(
    message: Message,
    senderId: string,
    confessionId: string,
    config: ThrottleConfig = this.defaultConfig,
  ): Promise<Message> {
    await this.enforceThrottle(senderId, confessionId, config);

    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);

    message.throttleKey = this.generateThrottleKey(senderId, confessionId);
    message.rateLimitWindow = windowStart;

    return message;
  }

  async getThrottleStatus(
    senderId: string,
    confessionId: string,
    config: ThrottleConfig = this.defaultConfig,
  ): Promise<ThrottleStatus> {
    return this.checkAndRecordMessage(senderId, confessionId, config);
  }

  async cleanupExpiredWindows(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await this.messageRepository.delete({
      rateLimitWindow: LessThan(oneHourAgo),
    });

    if (result.affected > 0) {
      this.logger.debug(
        `Cleaned up ${result.affected} expired throttle window records`,
      );
    }
  }
}
