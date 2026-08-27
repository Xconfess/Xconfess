import { ModerationService } from './moderation.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { AuditLogRedactionService } from '../../audit-log/audit-log-redaction.service';

describe('ModerationService', () => {
  function createRedactionMock() {
    return {
      redactMetadata: jest.fn((meta) => meta),
      isSensitiveField: jest.fn().mockReturnValue(false),
      maskUserId: jest.fn((id) => `user_${id}`),
      maskEmail: jest.fn((e) => e ? 'ma***@ex.com' : '[REDACTED_EMAIL]'),
      maskJwt: jest.fn(() => 'xxx.payload.xxx'),
      maskLongHex: jest.fn((h) => h.length > 8 ? '0xab...cd' : h),
    } as unknown as jest.Mocked<AuditLogRedactionService>;
  }

  it('logAction saves an audit log with ip/userAgent', async () => {
    const repo: any = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'log1' })),
      createQueryBuilder: jest.fn(),
    };

    const redaction = createRedactionMock();
    const svc = new ModerationService(repo, redaction);
    const req: any = {
      ip: '1.2.3.4',
      headers: { 'user-agent': 'jest' },
      socket: { remoteAddress: '9.9.9.9' },
    };

    const saved = await svc.logAction(
      1,
      AuditActionType.REPORT_RESOLVED,
      'report',
      'r1',
      { k: 'v' },
      'note',
      req,
    );

    expect(redaction.redactMetadata).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 1,
        action: AuditActionType.REPORT_RESOLVED,
        entityType: 'report',
        entityId: 'r1',
        metadata: expect.objectContaining({
          k: 'v',
          entityType: 'report',
          entityId: 'r1',
        }),
        notes: 'note',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(saved.id).toBe('log1');
    expect(saved.ipAddress).toBe('1.2.3.4');
    expect(saved.userAgent).toBe('jest');
  });

  it('passes metadata through redaction before saving', async () => {
    const repo: any = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'log-redact' })),
      createQueryBuilder: jest.fn(),
    };

    const redaction = createRedactionMock();
    redaction.redactMetadata.mockImplementation((meta) => ({
      ...meta,
      password: '[REDACTED]',
    }));

    const svc = new ModerationService(repo, redaction);

    await svc.logAction(
      1,
      AuditActionType.USER_BANNED,
      'user',
      '42',
      { reason: 'spam', password: 'secret123' },
      'banned for spam',
    );

    expect(redaction.redactMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'spam',
        password: 'secret123',
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          password: '[REDACTED]',
        }),
      }),
    );
  });

  it('falls back to raw metadata when redaction throws', async () => {
    const repo: any = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'log-fallback' })),
      createQueryBuilder: jest.fn(),
    };

    const redaction = createRedactionMock();
    redaction.redactMetadata.mockImplementation(() => {
      throw new Error('redaction failed');
    });

    const svc = new ModerationService(repo, redaction);

    const saved = await svc.logAction(
      1,
      AuditActionType.REPORT_RESOLVED,
      'report',
      'r1',
      { important: 'data' },
      'note',
    );

    expect(saved.id).toBe('log-fallback');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          important: 'data',
        }),
      }),
    );
  });

  it('getAuditLogs builds query with filters', async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: '1' }], 1]),
    };
    const repo: any = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const redaction = createRedactionMock();
    const svc = new ModerationService(repo, redaction);
    const [logs, total] = await svc.getAuditLogs(
      1,
      AuditActionType.REPORT_RESOLVED,
      'report',
      'r1',
      10,
      0,
    );
    expect(total).toBe(1);
    expect(logs[0].id).toBe('1');
    expect(qb.andWhere).toHaveBeenCalled();
  });
});
