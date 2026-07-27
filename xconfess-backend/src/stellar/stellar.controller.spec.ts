import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  InternalServerErrorException,
  ValidationPipe,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UserRole } from '../user/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StellarInvokeContractGuard } from './guards/stellar-invoke-contract.guard';
import { UserService } from '../user/user.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { StellarConfigService } from './stellar-config.service';

describe('StellarController authz', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let contractServiceMock: {
    invokeContract: jest.Mock;
    invocationFromAllowlistedDto: jest.Mock;
  };
  let auditLogMock: { log: jest.Mock };
  let stellarConfigMock: { getContractId: jest.Mock };

  const JWT_SECRET = 'JWT_TEST_SECRET_123';

  let SIGNER_SECRET: string;
  let SIGNER_PUBLIC: string;

  const VALID_HASH = 'a'.repeat(64);

  const makePayload = (opts: {
    sub: number;
    scopes?: string[];
    role?: UserRole;
  }) => ({
    sub: opts.sub,
    username: `user-${opts.sub}`,
    email: `user-${opts.sub}@example.com`,
    role: opts.role ?? UserRole.USER,
    scopes: opts.scopes ?? [],
  });

  const allowlistedBody = (overrides: Record<string, unknown> = {}) => ({
    operation: 'anchor_confession',
    confessionHash: VALID_HASH,
    timestamp: 1_700_000_000,
    sourceAccount: SIGNER_PUBLIC,
    ...overrides,
  });

  beforeAll(async () => {
    const signerKp = StellarSDK.Keypair.random();
    SIGNER_SECRET = signerKp.secret();
    SIGNER_PUBLIC = signerKp.publicKey();

    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };
    stellarConfigMock = {
      getContractId: jest.fn().mockReturnValue('CCONTRACT'),
    };

    contractServiceMock = {
      invokeContract: jest.fn().mockResolvedValue({
        hash: 'tx-hash',
        success: true,
        result: { ok: true },
      }),
      invocationFromAllowlistedDto: jest.fn().mockReturnValue({
        contractId: 'CCONTRACT',
        functionName: 'anchor_confession',
        args: [],
        sourceAccount: SIGNER_PUBLIC,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [StellarController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        StellarInvokeContractGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STELLAR_SERVER_SECRET') return SIGNER_SECRET;
              if (key === 'JWT_SECRET') return JWT_SECRET;
              return undefined;
            }),
          },
        },
        {
          provide: StellarService,
          useValue: { getNetworkConfig: jest.fn() },
        },
        { provide: ContractService, useValue: contractServiceMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: StellarConfigService, useValue: stellarConfigMock },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockImplementation(async (id: number) => ({
              role: id === 2 ? UserRole.USER : UserRole.ADMIN,
            })),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    contractServiceMock.invokeContract.mockClear();
    contractServiceMock.invocationFromAllowlistedDto.mockClear();
    auditLogMock.log.mockClear();
    stellarConfigMock.getContractId.mockClear();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .send(allowlistedBody());

    expect(res.status).toBe(401);
  });

  it('returns 403 and audits when the caller is not an admin', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 2,
        role: UserRole.USER,
        scopes: ['stellar:invoke-contract:anchor_confession'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(allowlistedBody());

    expect(res.status).toBe(403);
    expect(contractServiceMock.invokeContract).not.toHaveBeenCalled();
    expect(auditLogMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
        metadata: expect.objectContaining({
          outcome: 'denied',
          denialReason: 'admin_role_required',
          contractId: 'CCONTRACT',
          functionName: 'anchor_confession',
          sourceAccount: SIGNER_PUBLIC,
        }),
      }),
    );
  });

  it('returns 403 and audits when the admin lacks the operation scope', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 1,
        role: UserRole.ADMIN,
        scopes: ['stellar:invoke-contract:unrelated'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(allowlistedBody());

    expect(res.status).toBe(403);
    expect(contractServiceMock.invokeContract).not.toHaveBeenCalled();
    expect(auditLogMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
        metadata: expect.objectContaining({
          outcome: 'denied',
          denialReason: 'operation_scope_denied',
          contractId: 'CCONTRACT',
          functionName: 'anchor_confession',
          requiredScopes: expect.arrayContaining([
            'stellar:invoke-contract:anchor_confession',
          ]),
        }),
      }),
    );
  });

  it('succeeds when scope is present and payload matches allowlist', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 1,
        role: UserRole.ADMIN,
        scopes: ['stellar:invoke-contract:anchor_confession'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(allowlistedBody());

    expect([200, 201]).toContain(res.status);
    expect(
      contractServiceMock.invocationFromAllowlistedDto,
    ).toHaveBeenCalledTimes(1);
    expect(contractServiceMock.invokeContract).toHaveBeenCalledTimes(1);
    expect(res.body).toHaveProperty('hash', 'tx-hash');
    expect(auditLogMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
        metadata: expect.objectContaining({
          outcome: 'success',
          stellarOperation: 'anchor_confession',
          contractId: 'CCONTRACT',
          functionName: 'anchor_confession',
          sourceAccount: SIGNER_PUBLIC,
          transactionHash: 'tx-hash',
        }),
      }),
    );
    expect(auditLogMock.log.mock.calls[0][0].metadata).not.toHaveProperty(
      'confessionHash',
    );
  });

  it('returns 400 when sourceAccount is not the server signer', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 1,
        role: UserRole.ADMIN,
        scopes: ['stellar:invoke-contract:anchor_confession'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(
        allowlistedBody({
          sourceAccount:
            'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        }),
      );

    expect(res.status).toBe(400);
    expect(contractServiceMock.invokeContract).not.toHaveBeenCalled();
    expect(auditLogMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
        metadata: expect.objectContaining({
          outcome: 'denied',
          denialReason: 'source_account_mismatch',
          contractId: 'CCONTRACT',
          functionName: 'anchor_confession',
        }),
      }),
    );
  });

  it('returns 400 when confessionHash is not 64 hex chars', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 1,
        role: UserRole.ADMIN,
        scopes: ['stellar:invoke-contract:anchor_confession'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(
        allowlistedBody({
          confessionHash: 'deadbeef',
        }),
      );

    expect(res.status).toBe(400);
    expect(contractServiceMock.invokeContract).not.toHaveBeenCalled();
  });

  it('returns 400 when operation is not allowlisted', async () => {
    const token = jwtService.sign(
      makePayload({
        sub: 1,
        role: UserRole.ADMIN,
        scopes: ['stellar:invoke-contract:anchor_confession'],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/stellar/invoke-contract')
      .set('Authorization', `Bearer ${token}`)
      .send(
        allowlistedBody({
          operation: 'arbitrary_mint',
        }),
      );

    expect(res.status).toBe(400);
    expect(contractServiceMock.invokeContract).not.toHaveBeenCalled();
  });
});

describe('StellarController — misconfigured signer secret (#1472)', () => {
  it('returns a generic 500 and never leaks the malformed secret', async () => {
    const malformedSecret = 'not-a-valid-stellar-secret';
    const configServiceMock = {
      get: jest.fn((key: string) =>
        key === 'STELLAR_SERVER_SECRET' ? malformedSecret : undefined,
      ),
    };

    const controller = new StellarController(
      { getNetworkConfig: jest.fn() } as any,
      { invocationFromAllowlistedDto: jest.fn(), invokeContract: jest.fn() } as any,
      configServiceMock as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const dto = {
      operation: 'anchor_confession',
      confessionHash: 'a'.repeat(64),
      timestamp: 1_700_000_000,
      sourceAccount: 'GSOMEPUBLICKEYVALUEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    } as any;
    const req = { requestId: 'req-1' } as any;

    let caught: any;
    try {
      await controller.invokeContract(dto, req);
      throw new Error('expected invokeContract to reject');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(InternalServerErrorException);
    expect(caught.getStatus()).toBe(500);
    expect(caught.message).not.toContain(malformedSecret);
  });
});
