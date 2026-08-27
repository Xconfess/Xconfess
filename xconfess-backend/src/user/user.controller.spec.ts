import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;

  const mockUserService = {
    getPublicProfile: jest.fn(),
    getProfileSummary: jest.fn(),
    getUserActivitiesList: jest.fn(),
    getUserConfessionsList: jest.fn(),
    updateSettings: jest.fn(),
    deleteAccount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get<UserController>(UserController);
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns public profile data', async () => {
    const profile = { username: 'testuser', stats: { confessions: 2 } };
    mockUserService.getPublicProfile.mockResolvedValue(profile);

    await expect(controller.getPublicProfile('42')).resolves.toBe(profile);
    expect(mockUserService.getPublicProfile).toHaveBeenCalledWith('42');
  });

  it('returns the authenticated profile summary', async () => {
    const summary = { id: 42, username: 'testuser' };
    mockUserService.getProfileSummary.mockResolvedValue(summary);

    await expect(
      controller.getMyProfileSummary({ user: { sub: 42 } }),
    ).resolves.toBe(summary);
    expect(mockUserService.getProfileSummary).toHaveBeenCalledWith(42);
  });

  it('returns a specific profile summary with numeric user id', async () => {
    mockUserService.getProfileSummary.mockResolvedValue({ id: 42 });

    await controller.getProfileSummary('42');
    expect(mockUserService.getProfileSummary).toHaveBeenCalledWith(42);
  });

  it('returns paginated user activities', async () => {
    mockUserService.getUserActivitiesList.mockResolvedValue({ data: [] });

    await controller.getUserActivities('42', '2', '25');
    expect(mockUserService.getUserActivitiesList).toHaveBeenCalledWith(
      42,
      2,
      25,
    );
  });

  it('returns paginated user confessions', async () => {
    mockUserService.getUserConfessionsList.mockResolvedValue({ data: [] });

    await controller.getUserConfessions('42');
    expect(mockUserService.getUserConfessionsList).toHaveBeenCalledWith(
      42,
      1,
      10,
    );
  });

  it('updates settings for the authenticated user', async () => {
    const dto = { displayName: 'New Name' };
    mockUserService.updateSettings.mockResolvedValue({ ok: true });

    await controller.updateSettings('42', dto, { user: { id: 42 } });
    expect(mockUserService.updateSettings).toHaveBeenCalledWith(42, dto);
  });

  it('deletes the authenticated account', async () => {
    mockUserService.deleteAccount.mockResolvedValue({ deleted: true });

    await controller.deleteAccount('42', { user: { sub: 42 } });
    expect(mockUserService.deleteAccount).toHaveBeenCalledWith(42);
  });
});
