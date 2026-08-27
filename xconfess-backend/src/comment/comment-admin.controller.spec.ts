import { Test, TestingModule } from '@nestjs/testing';
import { CommentAdminController } from './comment-admin.controller';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ModerationStatus } from './entities/moderation-comment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';

const mockCommentService = {
  moderateComment: jest.fn(),
};

const mockAuditLogService = {
  log: jest.fn().mockResolvedValue(undefined),
};

/**
 * Helper: build a test module with both guards stubbed out via overrideGuard.
 * The guards themselves are tested in their own spec files; here we only test
 * that the controller delegates correctly and that the guard metadata is
 * applied at class level.
 */
async function buildModule() {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [CommentAdminController],
    providers: [
      { provide: CommentService, useValue: mockCommentService },
      { provide: AuditLogService, useValue: mockAuditLogService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(AdminGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return module;
}

describe('CommentAdminController', () => {
  let controller: CommentAdminController;
  let service: typeof mockCommentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await buildModule();
    controller = module.get(CommentAdminController);
    service = module.get(CommentService) as any;
  });

  // ── Route delegation ────────────────────────────────────────────────────────

  describe('approveComment() — POST /api/admin/comments/:id/approve', () => {
    it('calls moderateComment with APPROVED status and numeric id', async () => {
      const req = { user: { id: 1, role: 'admin' } } as any;
      mockCommentService.moderateComment.mockResolvedValue({
        success: true,
        message: `Comment ${ModerationStatus.APPROVED}`,
      });

      const result = await controller.approveComment('42', req);

      expect(service.moderateComment).toHaveBeenCalledTimes(1);
      expect(service.moderateComment).toHaveBeenCalledWith(
        42,
        ModerationStatus.APPROVED,
        req.user,
      );
      expect(result.success).toBe(true);
    });

    it('converts string id param to number before delegating', async () => {
      const req = { user: { id: 99, role: 'admin' } } as any;
      mockCommentService.moderateComment.mockResolvedValue({ success: true, message: '' });

      await controller.approveComment('7', req);
      const [calledId] = mockCommentService.moderateComment.mock.calls[0];
      expect(typeof calledId).toBe('number');
      expect(calledId).toBe(7);
    });

    it('creates an audit log row on successful approve', async () => {
      const req = { user: { id: 1, role: 'admin' } } as any;
      mockCommentService.moderateComment.mockResolvedValue({ success: true, message: '' });

      await controller.approveComment('42', req);

      expect(mockAuditLogService.log).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.COMMENT_APPROVED,
          metadata: expect.objectContaining({
            commentId: '42',
            entityType: 'comment',
            entityId: '42',
            status: ModerationStatus.APPROVED,
          }),
          context: expect.objectContaining({
            userId: '1',
            actor: expect.objectContaining({
              type: 'admin',
              id: '1',
              userId: '1',
            }),
          }),
        }),
      );
    });
  });

  describe('rejectComment() — POST /api/admin/comments/:id/reject', () => {
    it('calls moderateComment with REJECTED status and numeric id', async () => {
      const req = { user: { id: 2, role: 'admin' } } as any;
      mockCommentService.moderateComment.mockResolvedValue({
        success: true,
        message: `Comment ${ModerationStatus.REJECTED}`,
      });

      const result = await controller.rejectComment('15', req);

      expect(service.moderateComment).toHaveBeenCalledTimes(1);
      expect(service.moderateComment).toHaveBeenCalledWith(
        15,
        ModerationStatus.REJECTED,
        req.user,
      );
      expect(result.success).toBe(true);
    });

    it('creates an audit log row on successful reject', async () => {
      const req = { user: { id: 2, role: 'admin' } } as any;
      mockCommentService.moderateComment.mockResolvedValue({ success: true, message: '' });

      await controller.rejectComment('15', req);

      expect(mockAuditLogService.log).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.COMMENT_REJECTED,
          metadata: expect.objectContaining({
            commentId: '15',
            entityType: 'comment',
            entityId: '15',
            status: ModerationStatus.REJECTED,
          }),
          context: expect.objectContaining({
            userId: '2',
            actor: expect.objectContaining({
              type: 'admin',
              id: '2',
              userId: '2',
            }),
          }),
        }),
      );
    });
  });

  // ── Guard metadata contract ─────────────────────────────────────────────────

  describe('guard contract', () => {
    it('applies guards at the class level (not per-method)', () => {
      // Both JwtAuthGuard and AdminGuard must be registered as class-level
      // metadata so every future method automatically inherits them.
      const classGuards: any[] = Reflect.getMetadata('__guards__', CommentAdminController) ?? [];
      const guardNames = classGuards.map((g: any) => g.name ?? g.constructor?.name ?? String(g));

      expect(classGuards.length).toBeGreaterThanOrEqual(2);
      // Verify both expected guards are present by name
      expect(guardNames).toContain('JwtAuthGuard');
      expect(guardNames).toContain('AdminGuard');
    });

    it('does NOT register duplicate guards on individual methods', () => {
      // approveComment and rejectComment must NOT have their own __guards__
      // metadata — that would create an inconsistent stack if someone later
      // adds a method and forgets to copy the decorator.
      const approveGuards = Reflect.getMetadata(
        '__guards__',
        CommentAdminController.prototype,
        'approveComment',
      );
      const rejectGuards = Reflect.getMetadata(
        '__guards__',
        CommentAdminController.prototype,
        'rejectComment',
      );
      expect(approveGuards).toBeUndefined();
      expect(rejectGuards).toBeUndefined();
    });
  });

  // ── Guard enforcement (metadata-level) ────────────────────────────────────
  //
  // NestJS guard enforcement happens in the HTTP pipeline, not inside the
  // controller method itself, so a meaningful rejection test requires an
  // e2e/supertest harness (see the acceptance criteria manual curl steps).
  //
  // What we CAN assert at unit level is that the correct guard classes are
  // registered as class-level metadata — if they weren't, the HTTP pipeline
  // would never invoke them.
  describe('guard enforcement metadata', () => {
    it('JwtAuthGuard is registered as a class-level guard', () => {
      const classGuards: any[] = Reflect.getMetadata('__guards__', CommentAdminController) ?? [];
      const hasJwt = classGuards.some(
        (g) => g === JwtAuthGuard || g?.name === 'JwtAuthGuard',
      );
      expect(hasJwt).toBe(true);
    });

    it('AdminGuard is registered as a class-level guard', () => {
      const classGuards: any[] = Reflect.getMetadata('__guards__', CommentAdminController) ?? [];
      const hasAdmin = classGuards.some(
        (g) => g === AdminGuard || g?.name === 'AdminGuard',
      );
      expect(hasAdmin).toBe(true);
    });
  });
});
