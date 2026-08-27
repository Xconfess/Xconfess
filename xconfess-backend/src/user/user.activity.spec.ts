import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { EmailService } from '../email/email.service';
import { ActivityType } from './dto/user-activity.dto';
import * as confessionEncryption from '../utils/confession-encryption';
import { ConfigService } from '@nestjs/config';

describe('UserService - User Activities', () => {
  let service: UserService;
  let mockRepository: any;

  const mockUser = {
    id: 1,
    isDiscoverable: jest.fn().mockReturnValue(true),
  } as any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(mockUser),
      manager: {
        query: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: EmailService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('12345678901234567890123456789012'), // 32 chars
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should return paginated activities from multiple sources including reports', async () => {
    const mockCreatedAt = new Date();
    const rawActivities = [
      {
        id: 'c1',
        type: ActivityType.CONFESSION,
        content: 'iv:encrypted-message',
        metadata: { isAnchored: true },
        createdAt: mockCreatedAt,
      },
      {
        id: 'r1',
        type: ActivityType.REPORT,
        content: 'Offensive content',
        metadata: { reason: 'spam', status: 'pending', confessionId: 'c1' },
        createdAt: mockCreatedAt,
      },
    ];

    mockRepository.manager.query
      .mockResolvedValueOnce(rawActivities) // First call for data
      .mockResolvedValueOnce([{ total: '2' }]); // Second call for count

    // Mock decryption
    jest.spyOn(confessionEncryption, 'decryptConfession').mockReturnValue('decrypted-message');

    const result = await service.getUserActivitiesList(1, 1, 10);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].type).toBe(ActivityType.CONFESSION);
    expect(result.data[0].content).toBe('decrypted-message');
    expect(result.data[1].type).toBe(ActivityType.REPORT);
    expect(result.data[1].content).toBe('Offensive content');
    expect(result.meta.total).toBe(2);
    
    expect(mockRepository.manager.query).toHaveBeenCalledTimes(2);
  });

  it('should handle decryption failures gracefully', async () => {
    const mockCreatedAt = new Date();
    const rawActivities = [
      {
        id: 'c1',
        type: ActivityType.CONFESSION,
        content: 'bad-format',
        metadata: { isAnchored: false },
        createdAt: mockCreatedAt,
      },
    ];

    mockRepository.manager.query
      .mockResolvedValueOnce(rawActivities)
      .mockResolvedValueOnce([{ total: '1' }]);

    jest.spyOn(confessionEncryption, 'decryptConfession').mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    const result = await service.getUserActivitiesList(1, 1, 10);

    expect(result.data[0].content).toBe('[Encrypted Content]');
  });
});
