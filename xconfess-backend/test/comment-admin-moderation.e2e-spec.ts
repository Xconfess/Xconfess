import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../src/auth/admin.guard';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { CommentAdminController } from '../src/comment/comment-admin.controller';
import { CommentService } from '../src/comment/comment.service';
import { ModerationStatus } from '../src/comment/entities/moderation-comment.entity';

class FakeJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (authHeader === 'Bearer admin-token') {
      request.user = { id: 'admin-1', role: 'admin' };
      return true;
    }

    if (authHeader === 'Bearer user-token') {
      request.user = { id: 'user-1', role: 'user' };
      return true;
    }

    throw new UnauthorizedException('Unauthorized');
  }
}

describe('Comment Admin Moderation RBAC (e2e)', () => {
  let app: INestApplication;

  const mockCommentService = {
    moderateComment: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CommentAdminController],
      providers: [
        AdminGuard,
        {
          provide: CommentService,
          useValue: mockCommentService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommentService.moderateComment.mockResolvedValue({ success: true, message: '' });
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/comments/1/approve')
      .expect(401);
  });

  it('rejects authenticated non-admin users with 403 on approve', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/comments/1/approve')
      .set('Authorization', 'Bearer user-token')
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Only admins can access this endpoint');
      });
  });

  it('rejects authenticated non-admin users with 403 on reject', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/comments/1/reject')
      .set('Authorization', 'Bearer user-token')
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Only admins can access this endpoint');
      });
  });

  it('allows admins to approve a comment', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/comments/1/approve')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
      });

    expect(mockCommentService.moderateComment).toHaveBeenCalledWith(
      1,
      ModerationStatus.APPROVED,
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  it('allows admins to reject a comment', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/comments/1/reject')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
      });

    expect(mockCommentService.moderateComment).toHaveBeenCalledWith(
      1,
      ModerationStatus.REJECTED,
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
