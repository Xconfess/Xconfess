import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { UserPublicController } from './user-public.controller';
import { UserService } from './user.service';
import { CryptoUtil } from '../common/crypto.util';
import { RegisterDto } from '../auth/dto/register.dto';

describe('UserPublicController (#1730 request id)', () => {
  let controller: UserPublicController;
  const mockUserService = { create: jest.fn() };

  const fakeUser = {
    id: 7,
    username: 'alice',
    role: 'user',
    is_active: true,
    emailEncrypted: 'enc',
    emailIv: 'iv',
    emailTag: 'tag',
    notificationPreferences: {},
    isDiscoverable: () => true,
    canReceiveReplies: () => true,
    shouldShowReactions: () => true,
    hasDataProcessingConsent: () => true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserPublicController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get(UserPublicController);
    jest.clearAllMocks();
    jest.spyOn(CryptoUtil, 'decrypt').mockReturnValue('alice@example.com');
    mockUserService.create.mockResolvedValue(fakeUser);
  });

  const dto = {
    email: 'alice@example.com',
    password: 'Str0ng!Pass#1',
    username: 'alice',
  } as RegisterDto;

  it('forwards the middleware request id to UserService.create', async () => {
    const req = { requestId: 'req-abc-123' } as unknown as Request;

    await controller.register(dto, req);

    expect(mockUserService.create).toHaveBeenCalledWith(
      dto.email,
      dto.password,
      dto.username,
      'req-abc-123',
    );
  });

  it('passes undefined when no request id is present', async () => {
    const req = {} as Request;

    await controller.register(dto, req);

    expect(mockUserService.create).toHaveBeenCalledWith(
      dto.email,
      dto.password,
      dto.username,
      undefined,
    );
  });
});
