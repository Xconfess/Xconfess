import { Body, Controller, INestApplication, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ErrorUtils } from '../common/errors/error-utils';
import { ReactionController } from '../reaction/reaction.controller';
import { ReactionService } from '../reaction/reaction.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { TippingController } from '../tipping/tipping.controller';
import { TippingService } from '../tipping/tipping.service';

@Controller('submissions')
class SubmissionContractController {
  @Post()
  create(@Body() body: { idempotencyKey?: string }) {
    throw ErrorUtils.operationConflict(
      'confession_submission',
      'IDEMPOTENCY_KEY_REUSE',
      {
        message:
          'Idempotency key replay conflict: the request body does not match the original submission.',
        canRetry: false,
        retryWith: 'a new idempotency key',
      },
    );
  }
}

describe('Duplicate operation contract', () => {
  let app: INestApplication;
  let reactionService: { createReaction: jest.Mock };
  let tippingService: { verifyAndRecordTip: jest.Mock };

  beforeAll(async () => {
    reactionService = {
      createReaction: jest.fn(async (dto: any) => ({
        id: 'reaction-1',
        emoji: dto.emoji,
        confessionId: dto.confessionId,
      })),
    };
    tippingService = {
      verifyAndRecordTip: jest.fn(async () => {
        throw ErrorUtils.operationConflict('tip', 'ALREADY_PROCESSING', {
          message: 'Transaction is currently being processed.',
          state: 'pending',
          canRetry: true,
          retryAfter: 2,
        });
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ReactionController,
        TippingController,
        SubmissionContractController,
      ],
      providers: [
        { provide: ReactionService, useValue: reactionService },
        { provide: TippingService, useValue: tippingService },
      ],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = null;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectConflictEnvelope = (
    body: any,
    operation: string,
    reason: string,
  ) => {
    expect(body).toMatchObject({
      schemaVersion: 1,
      status: 409,
      code: 'CONFLICT',
      details: expect.objectContaining({
        operation,
        reason,
        canRetry: expect.any(Boolean),
      }),
    });
    expect(body).not.toHaveProperty('stack');
    expect(body.message).toBeTruthy();
  };

  it('treats a repeated reaction as an idempotent replay instead of a conflict', async () => {
    const payload = {
      confessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      emoji: 'heart',
      anonymousUserId: 'b47ac10b-58cc-4372-a567-0e02b2c3d480',
    };

    await request(app.getHttpServer())
      .post('/reactions')
      .send(payload)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/reactions')
      .send(payload)
      .expect(201);

    expect(replay.body.id).toBe('reaction-1');
    expect(reactionService.createReaction).toHaveBeenCalledTimes(2);
  });

  it('returns a structured conflict for a duplicate tip that is still processing', async () => {
    const response = await request(app.getHttpServer())
      .post('/confessions/confession-1/tips/verify')
      .send({ txId: 'a'.repeat(64) })
      .expect(409);

    expectConflictEnvelope(response.body, 'tip', 'ALREADY_PROCESSING');
    expect(response.body.details).toMatchObject({
      state: 'pending',
      canRetry: true,
    });
  });

  it('distinguishes tip validation failures from conflicts', async () => {
    const response = await request(app.getHttpServer())
      .post('/confessions/confession-1/tips/verify')
      .send({ txId: 'not-a-transaction-id' })
      .expect(400);

    expect(response.body.status).toBe(400);
    expect(response.body.code).toBe('BAD_REQUEST');
    expect(response.body.details?.operation).toBeUndefined();
    expect(response.body.details?.reason).toBeUndefined();
  });

  it('returns a structured conflict for a reused submission key with a new payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/submissions')
      .send({ idempotencyKey: 'same-key' })
      .expect(409);

    expectConflictEnvelope(
      response.body,
      'confession_submission',
      'IDEMPOTENCY_KEY_REUSE',
    );
    expect(response.body.details.retryWith).toBe('a new idempotency key');
    expect(response.body.details.canRetry).toBe(false);
  });
});
