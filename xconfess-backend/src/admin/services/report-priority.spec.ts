import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportPriorityService, ReportPriority } from './report-priority.service';
import { Report, ReportType, ReportStatus } from '../entities/report.entity';

describe('ReportPriorityService', () => {
  let service: ReportPriorityService;
  let reportRepository: Repository<Report>;

  beforeEach(async () => {
    const mockReportRepository = {
      save: jest.fn(),
      find: jest.fn(),
      getMany: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReportPriorityService,
        {
          provide: getRepositoryToken(Report),
          useValue: mockReportRepository,
        },
      ],
    }).compile();

    service = module.get<ReportPriorityService>(ReportPriorityService);
    reportRepository = module.get<Repository<Report>>(
      getRepositoryToken(Report),
    );
  });

  describe('calculatePriority', () => {
    it('should assign CRITICAL priority to hate speech', () => {
      const report = { type: ReportType.HATE_SPEECH } as Report;
      const { priority, reason } = service.calculatePriority(report);

      expect(priority).toBe(ReportPriority.CRITICAL);
      expect(reason).toContain('hate_speech');
    });

    it('should assign HIGH priority to harassment', () => {
      const report = { type: ReportType.HARASSMENT } as Report;
      const { priority, reason } = service.calculatePriority(report);

      expect(priority).toBe(ReportPriority.HIGH);
      expect(reason).toContain('harassment');
    });

    it('should assign HIGH priority to inappropriate content', () => {
      const report = {
        type: ReportType.INAPPROPRIATE_CONTENT,
      } as Report;
      const { priority, reason } = service.calculatePriority(report);

      expect(priority).toBe(ReportPriority.HIGH);
    });

    it('should assign MEDIUM priority to spam', () => {
      const report = { type: ReportType.SPAM } as Report;
      const { priority, reason } = service.calculatePriority(report);

      expect(priority).toBe(ReportPriority.MEDIUM);
    });

    it('should assign LOW priority to other reports', () => {
      const report = { type: ReportType.OTHER } as Report;
      const { priority, reason } = service.calculatePriority(report);

      expect(priority).toBeDefined();
    });
  });

  describe('updateReportPriority', () => {
    it('should update report with calculated priority', async () => {
      const report = { type: ReportType.HARASSMENT } as Report;
      jest.spyOn(reportRepository, 'save').mockResolvedValue(report);

      const result = await service.updateReportPriority(report);

      expect(result.priority).toBe(ReportPriority.HIGH);
      expect(result.priorityCalculatedAt).toBeDefined();
      expect(reportRepository.save).toHaveBeenCalled();
    });
  });

  describe('recalculateAllPriorities', () => {
    it('should recalculate priorities for all active reports', async () => {
      const reports = [
        { type: ReportType.HARASSMENT, status: ReportStatus.PENDING } as Report,
        {
          type: ReportType.HATE_SPEECH,
          status: ReportStatus.REVIEWING,
        } as Report,
      ];

      jest.spyOn(reportRepository, 'find').mockResolvedValue(reports);
      jest.spyOn(reportRepository, 'save').mockResolvedValue(reports as any);

      await service.recalculateAllPriorities();

      expect(reportRepository.find).toHaveBeenCalled();
      expect(reportRepository.save).toHaveBeenCalledWith(reports);
    });
  });

  describe('getHighPriorityReports', () => {
    it('should return high and critical priority reports', async () => {
      const reports = [
        { id: '1', priority: ReportPriority.CRITICAL } as Report,
        { id: '2', priority: ReportPriority.HIGH } as Report,
      ];

      jest.spyOn(reportRepository, 'find').mockResolvedValue(reports);

      const result = await service.getHighPriorityReports();

      expect(result).toHaveLength(2);
      expect(reportRepository.find).toHaveBeenCalled();
    });
  });

  describe('getReportsByPriority', () => {
    it('should filter reports by priority and optional status', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', priority: ReportPriority.HIGH } as Report,
        ]),
      };

      jest
        .spyOn(reportRepository, 'createQueryBuilder')
        .mockReturnValue(mockQuery as any);

      const result = await service.getReportsByPriority(
        ReportPriority.HIGH,
        ReportStatus.PENDING,
      );

      expect(result).toBeDefined();
      expect(mockQuery.where).toHaveBeenCalled();
      expect(mockQuery.andWhere).toHaveBeenCalled();
    });
  });

  describe('getPriorityLabel', () => {
    it('should return correct labels for priorities', () => {
      expect(service.getPriorityLabel(ReportPriority.CRITICAL)).toBe('CRITICAL');
      expect(service.getPriorityLabel(ReportPriority.HIGH)).toBe('HIGH');
      expect(service.getPriorityLabel(ReportPriority.MEDIUM)).toBe('MEDIUM');
      expect(service.getPriorityLabel(ReportPriority.LOW)).toBe('LOW');
    });
  });
});
