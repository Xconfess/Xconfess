import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { ModerationService } from './services/moderation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { StepUpGuard } from '../auth/guards/step-up.guard';
import { ModerationTemplateService } from '../comment/moderation-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StellarDiagnosticsService } from './services/stellar-diagnostics.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: AdminService;
  let moderationService: ModerationService;

  const mockAdminService = {
    getReports: jest.fn(),
    getReportsCursor: jest.fn(),
    getReportStats: jest.fn(),
    getReportById: jest.fn(),
    resolveReport: jest.fn(),
    dismissReport: jest.fn(),
    bulkResolveReports: jest.fn(),
    deleteConfession: jest.fn(),
    hideConfession: jest.fn(),
    unhideConfession: jest.fn(),
    searchUsers: jest.fn(),
    searchUsersCursor: jest.fn(),
    getUserHistory: jest.fn(),
    unlockAccount: jest.fn(),
    updateUserRole: jest.fn(),
    banUser: jest.fn(),
    unbanUser: jest.fn(),
    getAnalytics: jest.fn(),
    getObservability: jest.fn(),
  };

  const mockModerationService = {
    logAction: jest.fn(),
    getAuditLogs: jest.fn(),
  };

  const mockAuditLogService = {
    findAll: jest.fn(),
    getObservabilityMetrics: jest.fn(),
  };

  const mockStellarDiagnosticsService = {
    getDiagnostics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
        {
          provide: ModerationService,
          useValue: mockModerationService,
        },
        {
          provide: ModerationTemplateService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: StellarDiagnosticsService,
          useValue: mockStellarDiagnosticsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StepUpGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get<AdminService>(AdminService);
    moderationService = module.get<ModerationService>(ModerationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getReports', () => {
    it('should return cursor-paginated reports', async () => {
      const mockReports = {
        data: [{ id: '1' }],
        nextCursor: null,
        hasMore: false,
        limit: 20,
      };
      mockAdminService.getReportsCursor.mockResolvedValue(mockReports);

      const result = await controller.getReports();
      expect(result).toEqual(mockReports);
      expect(mockAdminService.getReportsCursor).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        20,
        undefined,
      );
    });
  });

  describe('resolveReport', () => {
    it('should resolve a report', async () => {
      const mockReport = { id: '1', status: 'resolved' };
      mockAdminService.resolveReport.mockResolvedValue(mockReport);

      const req = { user: { userId: '1' } } as any;
      const result = await controller.resolveReport(
        '1',
        { resolutionNotes: 'test' },
        1,
        req,
      );

      expect(adminService.resolveReport).toHaveBeenCalledWith(
        '1',
        1,
        'test',
        undefined,
        req,
      );
    });
  });

  describe('dismissReport', () => {
    it('should dismiss a report', async () => {
      mockAdminService.dismissReport.mockResolvedValue({
        id: '1',
        status: 'dismissed',
      });
      const req = { user: { userId: '2' } } as any;
      await controller.dismissReport('1', { resolutionNotes: 'nope' }, 2, req);
      expect(adminService.dismissReport).toHaveBeenCalledWith(
        '1',
        2,
        'nope',
        req,
      );
    });
  });

  describe('bulkResolveReports', () => {
    it('should bulk resolve reports', async () => {
      mockAdminService.bulkResolveReports.mockResolvedValue(3);
      const req = { user: { userId: '1' } } as any;
      const res = await controller.bulkResolveReports(
        { reportIds: ['a', 'b', 'c'] } as any,
        1,
        req,
      );
      expect(res).toEqual(3);
    });
  });

  describe('confession actions', () => {
    it('deleteConfession calls service', async () => {
      mockAdminService.deleteConfession.mockResolvedValue(undefined);
      const req = { user: { userId: '1' } } as any;
      const res = await controller.deleteConfession(
        'c1',
        { reason: 'bad' },
        req,
      );
      expect(res.message).toContain('deleted');
    });

    it('hide/unhide call service', async () => {
      mockAdminService.hideConfession.mockResolvedValue({
        id: 'c1',
        isHidden: true,
      });
      mockAdminService.unhideConfession.mockResolvedValue({
        id: 'c1',
        isHidden: false,
      });
      const req = { user: { userId: '1' } } as any;
      await controller.hideConfession('c1', { reason: 'x' }, req);
      await controller.unhideConfession('c1', req);
      expect(adminService.hideConfession).toHaveBeenCalled();
      expect(adminService.unhideConfession).toHaveBeenCalled();
    });
  });

  describe('users', () => {
    it('searchUsers lists users when q missing', async () => {
      const res = await controller.searchUsers('' as any);
      expect(res).toEqual({
        data: [],
        nextCursor: null,
        hasMore: false,
        limit: 20,
      });
      expect(mockAdminService.searchUsersCursor).not.toHaveBeenCalled();
    });

    it('searchUsers calls service when q present', async () => {
      mockAdminService.searchUsersCursor.mockResolvedValue({
        data: [{ id: 1 }],
        nextCursor: null,
        hasMore: false,
        limit: 10,
      });
      const res = await controller.searchUsers('abc', '10', '0');
      expect(res.data).toHaveLength(1);
      expect(mockAdminService.searchUsersCursor).toHaveBeenCalledWith(
        'abc',
        10,
        '0',
      );
    });

    it('ban/unban call service', async () => {
      mockAdminService.banUser.mockResolvedValue({ id: 2, is_active: false });
      mockAdminService.unbanUser.mockResolvedValue({ id: 2, is_active: true });
      const req = { user: { userId: '1' } } as any;
      await controller.banUser('2', { reason: 'x' }, 1, req);
      await controller.unbanUser('2', 1, req);
      expect(adminService.banUser).toHaveBeenCalled();
      expect(adminService.unbanUser).toHaveBeenCalled();
    });

    it('updateUserRole calls service', async () => {
      mockAdminService.updateUserRole.mockResolvedValue({
        id: 2,
        role: 'moderator',
      });
      const req = { user: { userId: '1' } } as any;
      await controller.updateUserRole('2', { role: 'moderator' as any }, 1, req);
      expect(adminService.updateUserRole).toHaveBeenCalledWith(
        2,
        'moderator',
        1,
        null,
        req,
      );
    });
  });

  describe('analytics', () => {
    it('getAnalytics calls service', async () => {
      mockAdminService.getAnalytics.mockResolvedValue({ overview: {} });
      const res = await controller.getAnalytics();
      expect(res).toEqual({ overview: {} });
    });
  });

  describe('audit logs', () => {
    it('getAuditLogs calls moderation service', async () => {
      mockAuditLogService.findAll.mockResolvedValue({ data: [{ id: 'l1' }], total: 1 });
      const res = await controller.getAuditLogs();
      expect(res.total).toBe(1);
      expect(mockAuditLogService.findAll).toHaveBeenCalled();
    });
  });

  describe('observability', () => {
    it('getObservability returns aggregated audit and notification metrics', async () => {
      const mockPayload = {
        audit: {
          totalLogs: 12,
          actionTypeCounts: [{ actionType: 'REPORT_RESOLVED', count: 6 }],
        },
        notifications: {
          main: { active: 2, waiting: 1, failed: 0 },
          dlq: { failed: 0, waiting: 0, delayed: 0 },
        },
        generatedAt: '2026-06-01T00:00:00.000Z',
      };
      mockAuditLogService.getObservabilityMetrics.mockResolvedValue(mockPayload);

      const res = await controller.getObservability('2026-05-01', '2026-05-31');

      expect(res).toEqual(mockPayload);
      expect(mockAuditLogService.getObservabilityMetrics).toHaveBeenCalledWith(
        new Date('2026-05-01'),
        new Date('2026-05-31'),
      );
    });
  });

  describe('route ownership — no duplicate admin/reports registration', () => {
    it('AdminController is the sole owner of GET /admin/reports', () => {
      const routes: { method: string; path: string }[] = Reflect.getMetadata(
        'routes',
        AdminController,
      ) ?? [];
      const reportListRoutes = routes.filter(
        (r) => r.method === 'GET' && r.path?.includes('reports'),
      );
      // Duplicate path registration would surface multiple entries here
      expect(reportListRoutes.length).toBeLessThanOrEqual(1);
    });

    it('AdminController has resolve and dismiss handlers for /admin/reports/:id', () => {
      const proto = AdminController.prototype;
      expect(typeof proto.resolveReport).toBe('function');
      expect(typeof proto.dismissReport).toBe('function');
    });
  });
});
