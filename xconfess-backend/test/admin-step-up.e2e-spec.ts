import {
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  INestApplication,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  StepUpGuard,
  STEP_UP_TOKEN_HEADER,
} from '../src/auth/guards/step-up.guard';
import {
  StepUpService,
  STEP_UP_TOKEN_PURPOSE,
} from '../src/auth/step-up.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AdminGuard } from '../src/auth/admin.guard';
import { ErrorCode } from '../src/common/errors/error-codes';
import { UserRole } from '../src/user/entities/user.entity';

const JWT_SECRET = 'step-up-e2e-secret';
const ADMIN_ID = 42;

/**
 * Minimal stand-in for a destructive admin endpoint. It mirrors the real
 * admin controller's guard stack (JwtAuthGuard + AdminGuard at the class level,
 * StepUpGuard on the destructive route) without pulling the full application
 * graph into the test.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
class TestAdminController {
  @Delete('confessions/:id')
  @UseGuards(StepUpGuard)
  deleteConfession(@Param('id') id: string) {
    return { message: 'Confession deleted successfully', id };
  }
}

class FakeAdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.headers.authorization !== 'Bearer admin-token') {
      throw new UnauthorizedException('Unauthorized');
    }
    req.user = { id: ADMIN_ID, role: UserRole.ADMIN };
    return true;
  }
}

describe('Admin step-up authentication (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const signProof = (
    sub: number,
    purpose: string = STEP_UP_TOKEN_PURPOSE,
    expiresIn: string | number = 300,
  ) => jwtService.sign({ sub, purpose }, { expiresIn: expiresIn as any });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [TestAdminController],
      providers: [
        StepUpGuard,
        {
          provide: StepUpService,
          useFactory: (jwt: JwtService) =>
            new StepUpService(
              jwt,
              { findById: jest.fn() } as any,
              { get: () => '300' } as any,
            ),
          inject: [JwtService],
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAdminAuthGuard)
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a destructive action with a valid step-up proof', async () => {
    const proof = signProof(ADMIN_ID);

    await request(app.getHttpServer())
      .delete('/api/admin/confessions/abc-123')
      .set('Authorization', 'Bearer admin-token')
      .set(STEP_UP_TOKEN_HEADER, proof)
      .expect(200);
  });

  it('rejects a destructive action without a step-up proof', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/admin/confessions/abc-123')
      .set('Authorization', 'Bearer admin-token')
      .expect(403);

    expect(res.body.code).toBe(ErrorCode.AUTH_STEP_UP_REQUIRED);
  });

  it('rejects a destructive action with an expired step-up proof', async () => {
    const proof = signProof(ADMIN_ID, STEP_UP_TOKEN_PURPOSE, '-1s');

    const res = await request(app.getHttpServer())
      .delete('/api/admin/confessions/abc-123')
      .set('Authorization', 'Bearer admin-token')
      .set(STEP_UP_TOKEN_HEADER, proof)
      .expect(403);

    expect(res.body.code).toBe(ErrorCode.AUTH_STEP_UP_EXPIRED);
  });

  it('rejects a proof minted for a different admin', async () => {
    const proof = signProof(ADMIN_ID + 1);

    const res = await request(app.getHttpServer())
      .delete('/api/admin/confessions/abc-123')
      .set('Authorization', 'Bearer admin-token')
      .set(STEP_UP_TOKEN_HEADER, proof)
      .expect(403);

    expect(res.body.code).toBe(ErrorCode.AUTH_STEP_UP_INVALID);
  });

  it('rejects a request that is not authenticated as admin', async () => {
    await request(app.getHttpServer())
      .delete('/api/admin/confessions/abc-123')
      .set(STEP_UP_TOKEN_HEADER, signProof(ADMIN_ID))
      .expect(401);
  });
});
