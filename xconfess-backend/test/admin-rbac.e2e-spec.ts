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
import {
  AiModerationService,
  ModerationStatus,
} from '../src/moderation/ai-moderation.service';
import { ModerationController } from '../src/moderation/moderation.controller';
import { ModerationRepositoryService } from '../src/moderation/moderation-repository.service';
import { UserRole } from '../src/user/entities/user.entity';

class FakeJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (authHeader === 'Bearer admin-token') {
      request.user = { id: 'admin-1', role: UserRole.ADMIN };
      return true;
    }

    if (authHeader === 'Bearer user-token') {
      request.user = { id: 'user-1', role: UserRole.USER };
      return true;
    }

    throw new UnauthorizedException('Unauthorized');
  }
}

describe('Admin RBAC Integration Tests (e2e)', () => {
  let app: INestApplication;

  const moderationRepoService = {
    getPendingReviews: jest.fn().mockResolvedValue([
      {
        id: 'log-1',
        moderationStatus: ModerationStatus.PENDING,
        requiresReview: true,
      },
    ]),
    updateReview: jest
      .fn()
      .mockImplementation(async (id, status, reviewedBy, notes) => ({
        id,
        moderationStatus: status,
        reviewedBy,
        reviewNotes: notes,
        reviewed: true,
      })),
    getModerationStats: jest.fn().mockResolvedValue({
      total: 4,
      byStatus: [{ status: ModerationStatus.FLAGGED, count: '2' }],
      avgScore: 0.72,
    }),
  };

  const aiModerationService = {
    getConfiguration: jest.fn(),
    updateThresholds: jest.fn(),
    moderateContent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        AdminGuard,
        {
          provide: ModerationRepositoryService,
          useValue: moderationRepoService,
        },
        {
          provide: AiModerationService,
          useValue: aiModerationService,
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
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/moderation/stats')
      .expect(401);
  });

  it('rejects authenticated non-admin users with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/moderation/stats')
      .set('Authorization', 'Bearer user-token')
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Only admins can access this endpoint');
      });
  });

  it('allows admins to fetch moderation stats', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/moderation/stats')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          total: 4,
          byStatus: [{ status: ModerationStatus.FLAGGED, count: '2' }],
          avgScore: 0.72,
        });
      });

    expect(moderationRepoService.getModerationStats).toHaveBeenCalledTimes(1);
  });

  it('protects pending moderation reviews behind admin RBAC', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/moderation/pending?limit=10&offset=5')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          {
            id: 'log-1',
            moderationStatus: ModerationStatus.PENDING,
            requiresReview: true,
          },
        ]);
      });

    expect(moderationRepoService.getPendingReviews).toHaveBeenCalledWith(10, 5);
  });

  it('allows admins to review moderation items', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/moderation/review/log-1')
      .set('Authorization', 'Bearer admin-token')
      .send({
        status: ModerationStatus.APPROVED,
        notes: 'Reviewed by admin',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: 'log-1',
          moderationStatus: ModerationStatus.APPROVED,
          reviewedBy: 'system',
          reviewNotes: 'Reviewed by admin',
          reviewed: true,
        });
      });

    expect(moderationRepoService.updateReview).toHaveBeenCalledWith(
      'log-1',
      ModerationStatus.APPROVED,
      'system',
      'Reviewed by admin',
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
