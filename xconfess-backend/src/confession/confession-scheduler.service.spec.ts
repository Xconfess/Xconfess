import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfessionSchedulerService } from './confession-scheduler.service';
import { AnonymousConfession } from './entities/confession.entity';

describe('ConfessionSchedulerService', () => {
  let service: ConfessionSchedulerService;
  let repo: jest.Mocked<Repository<AnonymousConfession>>;
  let queryBuilder: any;
  let updateBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    repo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    } as any;

    // First createQueryBuilder call = select, second = update
    repo.createQueryBuilder
      .mockReturnValueOnce(queryBuilder)
      .mockReturnValue(updateBuilder);

    const mockDataSource = {
      transaction: jest.fn(async (cb: any) =>
        cb({ getRepository: () => repo }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionSchedulerService,
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: repo,
        },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ConfessionSchedulerService>(
      ConfessionSchedulerService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publishScheduledConfessions', () => {
    it('publishes scheduled confessions whose publishAt has passed', async () => {
      const scheduled = [
        {
          id: 'conf-1',
          status: 'scheduled',
          publishAt: new Date('2025-01-01'),
        },
      ] as AnonymousConfession[];

      queryBuilder.getMany.mockResolvedValue(scheduled);
      updateBuilder.execute.mockResolvedValue({ affected: 1 });

      await service.publishScheduledConfessions();

      expect(updateBuilder.set).toHaveBeenCalledWith({
        status: 'published',
        created_at: expect.any(Date),
      });
      expect(updateBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: 'conf-1',
      });
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'status = :status',
        { status: 'scheduled' },
      );
    });

    it('skips confessions already published by a concurrent run (affected: 0)', async () => {
      const scheduled = [
        {
          id: 'conf-1',
          status: 'scheduled',
          publishAt: new Date('2025-01-01'),
        },
      ] as AnonymousConfession[];

      queryBuilder.getMany.mockResolvedValue(scheduled);
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await service.publishScheduledConfessions();

      expect(updateBuilder.execute).toHaveBeenCalled();
    });

    it('continues processing remaining confessions when one publish fails', async () => {
      const scheduled = [
        {
          id: 'conf-1',
          status: 'scheduled',
          publishAt: new Date('2025-01-01'),
        },
        {
          id: 'conf-2',
          status: 'scheduled',
          publishAt: new Date('2025-01-01'),
        },
      ] as AnonymousConfession[];

      queryBuilder.getMany.mockResolvedValue(scheduled);

      // First update throws, second succeeds
      updateBuilder.execute
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ affected: 1 });

      await service.publishScheduledConfessions();

      expect(updateBuilder.execute).toHaveBeenCalledTimes(2);
    });

    it('acquires pessimistic write lock on scheduled confessions', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await service.publishScheduledConfessions();

      expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    });

    it('does nothing when no confessions are due', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await service.publishScheduledConfessions();

      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('wraps the entire batch in a transaction', async () => {
      queryBuilder.getMany.mockResolvedValue([]);
      const ds = { transaction: jest.fn() };
      const svc = new ConfessionSchedulerService(repo, ds as any);

      ds.transaction.mockImplementation(async (cb: any) => cb({ getRepository: () => repo }));

      await svc.publishScheduledConfessions();
      expect(ds.transaction).toHaveBeenCalled();
    });
  });

  describe('scheduleConfession', () => {
    it('schedules a confession for future publishing', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const confession = {
        id: 'conf-1',
        status: 'published',
        publishAt: null,
      } as AnonymousConfession;

      repo.findOne.mockResolvedValue(confession);
      repo.save.mockResolvedValue({
        ...confession,
        status: 'scheduled',
        publishAt: futureDate,
      });

      const result = await service.scheduleConfession('conf-1', futureDate);

      expect(result.status).toBe('scheduled');
      expect(result.publishAt).toEqual(futureDate);
    });

    it('throws when confession is not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.scheduleConfession('missing', new Date(Date.now() + 3600000)),
      ).rejects.toThrow('Confession not found');
    });

    it('throws when publish date is in the past', async () => {
      repo.findOne.mockResolvedValue({
        id: 'conf-1',
        status: 'published',
      } as AnonymousConfession);

      await expect(
        service.scheduleConfession('conf-1', new Date('2020-01-01')),
      ).rejects.toThrow('Publish date must be in the future');
    });
  });

  describe('cancelSchedule', () => {
    it('reverts a scheduled confession back to draft', async () => {
      const confession = {
        id: 'conf-1',
        status: 'scheduled',
        publishAt: new Date(Date.now() + 3600000),
      } as AnonymousConfession;

      repo.findOne.mockResolvedValue(confession);
      repo.save.mockResolvedValue({
        ...confession,
        status: 'draft',
        publishAt: null,
      });

      const result = await service.cancelSchedule('conf-1');

      expect(result.status).toBe('draft');
      expect(result.publishAt).toBeNull();
    });

    it('throws when confession is not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.cancelSchedule('missing')).rejects.toThrow(
        'Confession not found',
      );
    });
  });

  describe('getScheduledConfessions', () => {
    it('returns scheduled confessions for a user ordered by publishAt ASC', async () => {
      const confessions = [
        { id: 'c2', publishAt: new Date('2025-02-01') },
        { id: 'c1', publishAt: new Date('2025-01-01') },
      ] as AnonymousConfession[];

      repo.find.mockResolvedValue(confessions);

      const result = await service.getScheduledConfessions('user-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { anonymousUserId: 'user-1', status: 'scheduled' },
        order: { publishAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });
  });
});
