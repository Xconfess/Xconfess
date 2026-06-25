import { AdminService } from './admin.service';
import { ModerationService } from './moderation.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Report, ReportStatus } from '../entities/report.entity';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { AnonymousConfession } from '../../confession/entities/confession.entity';
import { User } from '../../user/entities/user.entity';

function createChainableQB(overrides: Partial<any> = {}) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    ...overrides,
  };
  return qb;
}

describe('AdminService', () => {
  const moderationService: Partial<ModerationService> = {
    logAction: jest.fn(),
  };

  const reportRepository: any = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const confessionRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const userRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const userAnonRepository: any = {
    find: jest.fn(),
  };

  const tipRepository: any = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const moderationTemplateService: any = {
    findById: jest.fn().mockResolvedValue(null),
  };

  const configService: any = {
    get: jest.fn().mockReturnValue(''),
  };

  const eventEmitter: any = {
    emit: jest.fn(),
  };

  const auditLogService: any = {
    getStatistics: jest.fn(),
  };

  const jobManagementService: any = {
    getDiagnostics: jest.fn(),
  };

  let service: AdminService;

  beforeEach(() => {
    jest.resetAllMocks();
    reportRepository.manager.transaction.mockImplementation(async (work: any) =>
      work({
        getRepository: (entity: any) => {
          if (entity === Report) {
            return reportRepository;
          }
          if (entity === AnonymousConfession) {
            return confessionRepository;
          }
          if (entity === User) {
            return userRepository;
          }
          return reportRepository;
        },
      }),
    );
    service = new AdminService(
      reportRepository,
      confessionRepository,
      userRepository,
      userAnonRepository,
      tipRepository,
      moderationService as ModerationService,
      moderationTemplateService,
      configService,
      eventEmitter,
      auditLogService,
      jobManagementService,
    );
  });

  it('getReports returns list + total and does not throw on decrypt failure', async () => {
    const qb = createChainableQB({
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'r1',
            confession: { message: 'not-encrypted' },
          },
        ],
        1,
      ]),
    });
    reportRepository.createQueryBuilder.mockReturnValue(qb);

    const [rows, total] = await service.getReports(
      undefined,
      undefined,
      undefined,
      undefined,
      50,
      0,
    );
    expect(total).toBe(1);
    expect(rows[0].id).toBe('r1');
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });

  it('getReportById throws if missing', async () => {
    reportRepository.findOne.mockResolvedValue(null);
    await expect(service.getReportById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolveReport updates status and logs audit action', async () => {
    const report: any = {
      id: 'r1',
      status: ReportStatus.PENDING,
      type: 'spam',
      confessionId: 'c1',
      confession: { message: 'not-encrypted' },
    };
    reportRepository.findOne.mockResolvedValue(report);
    reportRepository.save.mockImplementation(async (r: any) => r);

    const res = await service.resolveReport('r1', 1, 'ok', null, {} as any);
    expect(res.status).toBe(ReportStatus.RESOLVED);
    expect(moderationService.logAction).toHaveBeenCalledWith(
      1,
      AuditActionType.REPORT_RESOLVED,
      'report',
      'r1',
      expect.any(Object),
      'ok',
      expect.anything(),
      expect.anything(),
    );
  });

  it('resolveReport throws if already resolved', async () => {
    reportRepository.findOne.mockResolvedValue({
      id: 'r1',
      status: ReportStatus.RESOLVED,
    });
    await expect(
      service.resolveReport('r1', 1, null, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolveReport rolls back status update when audit logging fails', async () => {
    const committedState = {
      report: {
        id: 'r1',
        status: ReportStatus.PENDING,
        type: 'spam',
        confessionId: 'c1',
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        templateId: null,
      } as any,
    };

    reportRepository.manager.transaction.mockImplementationOnce(
      async (work: any) => {
        const stagedReport = { ...committedState.report };
        const txReportRepo = {
          findOne: jest.fn().mockResolvedValue(stagedReport),
          save: jest.fn().mockImplementation(async (report: any) => report),
        };

        const result = await work({
          getRepository: (entity: any) => {
            if (entity === Report) {
              return txReportRepo;
            }
            if (entity === AnonymousConfession) {
              return confessionRepository;
            }
            if (entity === User) {
              return userRepository;
            }
            return txReportRepo;
          },
        });
        committedState.report = stagedReport;
        return result;
      },
    );

    (moderationService.logAction as jest.Mock).mockRejectedValueOnce(
      new Error('Injected audit failure'),
    );

    await expect(
      service.resolveReport('r1', 1, 'note', null, {} as any),
    ).rejects.toThrow('Injected audit failure');

    expect(committedState.report.status).toBe(ReportStatus.PENDING);
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'report.updated',
      expect.anything(),
    );
  });

  it('dismissReport updates status and logs audit action', async () => {
    const report: any = {
      id: 'r1',
      status: ReportStatus.PENDING,
      type: 'spam',
      confessionId: 'c1',
    };
    reportRepository.findOne.mockResolvedValue(report);
    reportRepository.save.mockImplementation(async (r: any) => r);

    const res = await service.dismissReport('r1', 2, 'no violation', {} as any);
    expect(res.status).toBe(ReportStatus.DISMISSED);
    expect(moderationService.logAction).toHaveBeenCalledWith(
      2,
      AuditActionType.REPORT_DISMISSED,
      'report',
      'r1',
      expect.any(Object),
      'no violation',
      expect.anything(),
      expect.anything(),
    );
  });

  it('bulkResolveReports returns structured result when none pending', async () => {
    reportRepository.find.mockResolvedValue([]);
    const result = await service.bulkResolveReports(['a'], 1, null, undefined);
    expect(result.resolved).toBe(0);
    expect(result.notFound).toBe(1);
    expect(result.outcomes[0]).toMatchObject({ id: 'a', outcome: 'not_found' });
  });

  it('bulkResolveReports resolves pending reports and logs per-report audit', async () => {
    reportRepository.find.mockResolvedValue([
      { id: 'a', status: ReportStatus.PENDING },
    ]);
    reportRepository.save.mockResolvedValue(undefined);
    const result = await service.bulkResolveReports(
      ['a'],
      1,
      'notes',
      {} as any,
    );
    expect(result.resolved).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.notFound).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ id: 'a', outcome: 'resolved' });
    expect(moderationService.logAction).toHaveBeenCalledWith(
      1,
      AuditActionType.BULK_ACTION,
      'report',
      'a',
      expect.objectContaining({ outcome: 'resolved', action: 'bulk_resolve' }),
      'notes',
      expect.anything(),
      expect.anything(),
    );
  });

  it('bulkResolveReports skips already-resolved reports', async () => {
    reportRepository.find.mockResolvedValue([
      { id: 'b', status: ReportStatus.RESOLVED },
    ]);
    reportRepository.save.mockResolvedValue(undefined);
    const result = await service.bulkResolveReports(['b'], 1, null, undefined);
    expect(result.resolved).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.outcomes[0]).toMatchObject({ id: 'b', outcome: 'skipped' });
    // Audit log still fired for the skipped report
    expect(moderationService.logAction).toHaveBeenCalledWith(
      1,
      AuditActionType.BULK_ACTION,
      'report',
      'b',
      expect.objectContaining({ outcome: 'skipped' }),
      null,
      undefined,
      expect.anything(),
    );
  });

  it('bulkResolveReports handles mixed success/skip/not_found in one call', async () => {
    reportRepository.find.mockResolvedValue([
      { id: 'ok', status: ReportStatus.PENDING },
      { id: 'skip', status: ReportStatus.DISMISSED },
    ]);
    reportRepository.save.mockResolvedValue(undefined);
    const result = await service.bulkResolveReports(
      ['ok', 'skip', 'missing'],
      1,
      'bulk',
      {} as any,
    );
    expect(result.requested).toBe(3);
    expect(result.resolved).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.notFound).toBe(1);
    // One audit entry per requested ID
    expect((moderationService.logAction as jest.Mock).mock.calls).toHaveLength(
      3,
    );
  });

  it('deleteConfession throws if confession missing', async () => {
    confessionRepository.findOne.mockResolvedValue(null);
    await expect(
      service.deleteConfession('c1', 1, null, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hide/unhide confession toggles isHidden and logs', async () => {
    const confession: any = { id: 'c1', isHidden: false };
    confessionRepository.findOne.mockResolvedValue(confession);
    confessionRepository.save.mockImplementation(async (c: any) => c);

    const hidden = await service.hideConfession('c1', 1, 'reason', {} as any);
    expect(hidden.isHidden).toBe(true);

    const confession2: any = { id: 'c1', isHidden: true };
    confessionRepository.findOne.mockResolvedValue(confession2);
    const unhidden = await service.unhideConfession('c1', 1, {} as any);
    expect(unhidden.isHidden).toBe(false);
  });

  it('ban/unban user toggles is_active and logs', async () => {
    const user: any = { id: 10, is_active: true };
    userRepository.findOne.mockResolvedValue(user);
    userRepository.save.mockImplementation(async (u: any) => u);
    const banned = await service.banUser(10, 1, 'reason', {} as any);
    expect(banned.is_active).toBe(false);

    const user2: any = { id: 10, is_active: false };
    userRepository.findOne.mockResolvedValue(user2);
    const unbanned = await service.unbanUser(10, 1, {} as any);
    expect(unbanned.is_active).toBe(true);
  });

  it('getUserHistory returns user + confessions + reports', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      username: 'u',
      isAdmin: false,
      is_active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    reportRepository.find.mockResolvedValue([]);
    userAnonRepository.find.mockResolvedValue([{ anonymousUserId: 'anon1' }]);
    const qb = createChainableQB({
      getMany: jest.fn().mockResolvedValue([{ id: 'c1', message: 'x' }]),
    });
    confessionRepository.createQueryBuilder.mockReturnValue(qb);

    const res = await service.getUserHistory(1);
    expect(res.user.id).toBe(1);
    expect(Array.isArray(res.confessions)).toBe(true);
  });

  it('getAnalytics returns expected shape', async () => {
    userRepository.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
    confessionRepository.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    reportRepository.count.mockResolvedValue(3);

    const qbActive = createChainableQB({
      getCount: jest.fn().mockResolvedValue(4),
    });
    userRepository.createQueryBuilder.mockReturnValue(qbActive);

    const qbStatus = createChainableQB({
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ status: 'pending', count: '1' }]),
    });
    const qbType = createChainableQB({
      getRawMany: jest.fn().mockResolvedValue([{ type: 'spam', count: '1' }]),
    });
    reportRepository.createQueryBuilder
      .mockReturnValueOnce(qbStatus)
      .mockReturnValueOnce(qbType);

    const qbTrend = createChainableQB({
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ date: new Date().toISOString(), count: '2' }]),
    });
    confessionRepository.createQueryBuilder.mockReturnValue(qbTrend);

    const res = await service.getAnalytics(undefined, undefined);
    expect(res.overview.totalUsers).toBeDefined();
    expect(res.reports.byStatus).toBeDefined();
    expect(res.trends.confessionsOverTime).toBeDefined();
  });

  // ── Operator anchor & tip lookup (#778) ──────────────────────────────────

  it('lookupAnchorAndTip throws when neither txHash nor confessionId provided', async () => {
    await expect(service.lookupAnchorAndTip({})).rejects.toBeInstanceOf(
      require('@nestjs/common').BadRequestException,
    );
  });

  it('lookupAnchorAndTip by txHash returns anchor and tip records', async () => {
    const confession = {
      id: 'conf-x',
      stellarTxHash: 'tx-abc',
      stellarHash: 'hash-abc',
      isAnchored: true,
      anchoredAt: new Date('2026-01-01'),
    };
    const tip = {
      id: 'tip-1',
      txId: 'tx-abc',
      amount: '1.5',
      senderAddress: 'GADDR',
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      createdAt: new Date(),
    };
    confessionRepository.findOne = jest.fn().mockResolvedValue(confession);
    tipRepository.findOne.mockResolvedValue(tip);

    const result = await service.lookupAnchorAndTip({ txHash: 'tx-abc' });

    expect(result.anchor).not.toBeNull();
    expect(result.anchor!.confessionId).toBe('conf-x');
    expect(result.anchor!.isAnchored).toBe(true);
    expect(result.tips).toHaveLength(1);
    expect(result.tips[0].txId).toBe('tx-abc');
  });

  it('lookupAnchorAndTip returns null anchor when not found', async () => {
    confessionRepository.findOne = jest.fn().mockResolvedValue(null);
    tipRepository.findOne.mockResolvedValue(null);

    const result = await service.lookupAnchorAndTip({ txHash: 'tx-missing' });

    expect(result.anchor).toBeNull();
    expect(result.tips).toHaveLength(0);
  });

  it('lookupAnchorAndTip by confessionId returns tips list', async () => {
    const confession = {
      id: 'conf-y',
      stellarTxHash: null,
      stellarHash: null,
      isAnchored: false,
      anchoredAt: null,
    };
    const tips = [
      {
        id: 'tip-2',
        txId: 'tx-2',
        amount: '2.0',
        senderAddress: null,
        verificationStatus: 'verified',
        verifiedAt: null,
        createdAt: new Date(),
      },
    ];
    confessionRepository.findOne = jest.fn().mockResolvedValue(confession);
    tipRepository.find.mockResolvedValue(tips);
    tipRepository.findOne.mockResolvedValue(null);

    const result = await service.lookupAnchorAndTip({ confessionId: 'conf-y' });

    expect(result.anchor!.confessionId).toBe('conf-y');
    expect(result.tips).toHaveLength(1);
  });
});
