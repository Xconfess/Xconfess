import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModerationRepositoryService } from './moderation-repository.service';
import { ModerationLog } from './entities/moderation-log.entity';
import { ModerationStatus } from './ai-moderation.service';
import { InvalidModerationTransitionError } from './moderation-state-machine';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Covers issue #2023: audit logging for moderation state transitions.
 * transitionState() is the single write path for a moderation status
 * change, so these tests exercise both halves of the acceptance criteria
 * at once — the state change itself, and the audit entry it produces.
 */
describe('ModerationRepositoryService — transitionState (#2023)', () => {
  let service: ModerationRepositoryService;
  let managerRepoMock: { findOne: jest.Mock; save: jest.Mock };
  let auditLogService: { logModerationStateTransition: jest.Mock };
  let dataSourceMock: { transaction: jest.Mock };

  const actor = { id: '7', email: 'admin@example.com' };
  const CONFESSION_BODY =
    'the actual confession text — must never reach the audit log';

  const buildLog = (overrides: Partial<ModerationLog> = {}): ModerationLog =>
    ({
      id: 'log-1',
      confessionId: 'confession-1',
      userId: 'user-1',
      content: CONFESSION_BODY,
      moderationScore: 0.42,
      moderationFlags: [],
      moderationStatus: ModerationStatus.PENDING,
      details: null,
      requiresReview: true,
      reviewed: false,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      autoActioned: false,
      apiProvider: 'fallback',
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as ModerationLog;

  beforeEach(async () => {
    managerRepoMock = { findOne: jest.fn(), save: jest.fn() };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb: any) =>
        cb({ getRepository: jest.fn().mockReturnValue(managerRepoMock) }),
      ),
    };

    auditLogService = {
      logModerationStateTransition: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationRepositoryService,
        {
          provide: getRepositoryToken(ModerationLog),
          useValue: { createQueryBuilder: jest.fn(), find: jest.fn() },
        },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(ModerationRepositoryService);
  });

  it('persists a valid transition and writes a matching audit entry', async () => {
    const log = buildLog({ moderationStatus: ModerationStatus.PENDING });
    managerRepoMock.findOne.mockResolvedValue(log);
    managerRepoMock.save.mockImplementation(async (l) => l);

    const result = await service.transitionState(
      'log-1',
      ModerationStatus.FLAGGED,
      actor,
      'AI score above medium threshold',
      'queued for human review',
    );

    expect(result.moderationStatus).toBe(ModerationStatus.FLAGGED);
    expect(result.reviewed).toBe(true);
    expect(result.reviewedBy).toBe(actor.id);
    expect(managerRepoMock.save).toHaveBeenCalledTimes(1);

    expect(auditLogService.logModerationStateTransition).toHaveBeenCalledWith(
      'log-1',
      ModerationStatus.PENDING,
      ModerationStatus.FLAGGED,
      actor.id,
      'AI score above medium threshold',
      expect.objectContaining({
        confessionId: 'confession-1',
        notes: 'queued for human review',
      }),
    );
  });

  it('never includes the moderation log content in the audit call', async () => {
    const log = buildLog({ moderationStatus: ModerationStatus.PENDING });
    managerRepoMock.findOne.mockResolvedValue(log);
    managerRepoMock.save.mockImplementation(async (l) => l);

    await service.transitionState(
      'log-1',
      ModerationStatus.APPROVED,
      actor,
      'manual approval',
    );

    const metadataArg =
      auditLogService.logModerationStateTransition.mock.calls[0][5];
    expect(JSON.stringify(metadataArg)).not.toContain(CONFESSION_BODY);
  });

  it('rejects an invalid transition, writes nothing, and audits nothing', async () => {
    const log = buildLog({ moderationStatus: ModerationStatus.RESOLVED });
    managerRepoMock.findOne.mockResolvedValue(log);

    await expect(
      service.transitionState(
        'log-1',
        ModerationStatus.ESCALATED,
        actor,
        'attempted skip',
      ),
    ).rejects.toThrow(InvalidModerationTransitionError);

    expect(managerRepoMock.save).not.toHaveBeenCalled();
    expect(auditLogService.logModerationStateTransition).not.toHaveBeenCalled();
  });

  it('rejects a same-state no-op transition', async () => {
    const log = buildLog({ moderationStatus: ModerationStatus.FLAGGED });
    managerRepoMock.findOne.mockResolvedValue(log);

    await expect(
      service.transitionState('log-1', ModerationStatus.FLAGGED, actor, 'noop'),
    ).rejects.toThrow(InvalidModerationTransitionError);

    expect(managerRepoMock.save).not.toHaveBeenCalled();
    expect(auditLogService.logModerationStateTransition).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the moderation log does not exist', async () => {
    managerRepoMock.findOne.mockResolvedValue(null);

    await expect(
      service.transitionState('missing-id', ModerationStatus.APPROVED, actor, 'n/a'),
    ).rejects.toThrow(NotFoundException);

    expect(managerRepoMock.save).not.toHaveBeenCalled();
    expect(auditLogService.logModerationStateTransition).not.toHaveBeenCalled();
  });
});
