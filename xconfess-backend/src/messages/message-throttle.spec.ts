import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessageThrottleService } from './message-throttle.service';
import { Message } from './entities/message.entity';
import { TooManyRequestsException } from '@nestjs/common';

describe('MessageThrottleService', () => {
  let service: MessageThrottleService;
  let messageRepository: Repository<Message>;

  beforeEach(async () => {
    const mockMessageRepository = {
      count: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        MessageThrottleService,
        {
          provide: getRepositoryToken(Message),
          useValue: mockMessageRepository,
        },
      ],
    }).compile();

    service = module.get<MessageThrottleService>(MessageThrottleService);
    messageRepository = module.get<Repository<Message>>(
      getRepositoryToken(Message),
    );
  });

  describe('checkAndRecordMessage', () => {
    it('should allow messages within limit', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(2);

      const status = await service.checkAndRecordMessage('sender-1', 'confession-1');

      expect(status.isThrottled).toBe(false);
      expect(status.remaining).toBe(3);
      expect(status.messagesSentInWindow).toBe(2);
    });

    it('should throttle when limit exceeded', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(5);

      const status = await service.checkAndRecordMessage('sender-1', 'confession-1');

      expect(status.isThrottled).toBe(true);
      expect(status.remaining).toBe(0);
    });
  });

  describe('enforceThrottle', () => {
    it('should throw when throttled', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(5);

      await expect(
        service.enforceThrottle('sender-1', 'confession-1'),
      ).rejects.toThrow(TooManyRequestsException);
    });

    it('should not throw when under limit', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(2);

      await expect(
        service.enforceThrottle('sender-1', 'confession-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('recordMessageWithThrottle', () => {
    it('should add throttle metadata to message', async () => {
      const message = {} as Message;
      jest.spyOn(messageRepository, 'count').mockResolvedValue(1);

      const result = await service.recordMessageWithThrottle(
        message,
        'sender-1',
        'confession-1',
      );

      expect(result.throttleKey).toBeDefined();
      expect(result.rateLimitWindow).toBeDefined();
    });

    it('should respect custom window size', async () => {
      const message = {} as Message;
      jest.spyOn(messageRepository, 'count').mockResolvedValue(1);

      const customConfig = { windowMs: 5000, maxMessages: 10 };
      const result = await service.recordMessageWithThrottle(
        message,
        'sender-1',
        'confession-1',
        customConfig,
      );

      expect(result.throttleKey).toBeDefined();
    });
  });

  describe('getThrottleStatus', () => {
    it('should return accurate throttle status', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(3);

      const status = await service.getThrottleStatus('sender-1', 'confession-1');

      expect(status.isThrottled).toBe(false);
      expect(status.remaining).toBe(2);
      expect(status.resetTime).toBeDefined();
    });
  });

  describe('cleanupExpiredWindows', () => {
    it('should delete expired window records', async () => {
      jest.spyOn(messageRepository, 'delete').mockResolvedValue({
        affected: 10,
        raw: [],
      });

      await service.cleanupExpiredWindows();

      expect(messageRepository.delete).toHaveBeenCalled();
    });
  });

  describe('burst traffic handling', () => {
    it('should handle legitimate burst traffic correctly', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(4);

      const status = await service.getThrottleStatus('sender-1', 'confession-1');

      expect(status.isThrottled).toBe(false);
      expect(status.remaining).toBe(1);
    });

    it('should block after burst limit exceeded', async () => {
      jest.spyOn(messageRepository, 'count').mockResolvedValue(6);

      await expect(
        service.enforceThrottle('sender-1', 'confession-1'),
      ).rejects.toThrow();
    });
  });
});
