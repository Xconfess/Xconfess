import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import { StepUpService, STEP_UP_TOKEN_PURPOSE } from './step-up.service';
import { StepUpDto } from './dto/step-up.dto';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CryptoUtil } from '../common/crypto.util';

describe('StepUpService', () => {
  const secret = 'test-jwt-secret';
  let jwtService: JwtService;
  let userService: { findById: jest.Mock };
  let service: StepUpService;

  const password = 'S3cret!pass';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    jwtService = new JwtService({ secret });
    userService = { findById: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue('300'),
    } as unknown as ConfigService;
    service = new StepUpService(jwtService, userService as any, configService);
  });

  const buildUser = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    password: passwordHash,
    totpEnabled: false,
    totpSecretEncrypted: null,
    totpSecretIv: null,
    totpSecretTag: null,
    ...overrides,
  });

  describe('createProof', () => {
    it('issues a proof for a valid password', async () => {
      userService.findById.mockResolvedValue(buildUser());

      const result = await service.createProof(1, { password } as StepUpDto);

      expect(result.expiresIn).toBe(300);
      const decoded = jwtService.verify<any>(result.stepUpToken);
      expect(decoded.sub).toBe(1);
      expect(decoded.purpose).toBe(STEP_UP_TOKEN_PURPOSE);
    });

    it('issues a proof for a valid TOTP token', async () => {
      const totpSecret = speakeasy.generateSecret();
      const enc = CryptoUtil.encrypt(totpSecret.base32);
      userService.findById.mockResolvedValue(
        buildUser({
          totpEnabled: true,
          totpSecretEncrypted: enc.encrypted,
          totpSecretIv: enc.iv,
          totpSecretTag: enc.tag,
        }),
      );
      const token = speakeasy.totp({
        secret: totpSecret.base32,
        encoding: 'base32',
      });

      const result = await service.createProof(1, {
        totpToken: token,
      } as StepUpDto);

      const decoded = jwtService.verify<any>(result.stepUpToken);
      expect(decoded.purpose).toBe(STEP_UP_TOKEN_PURPOSE);
    });

    it('rejects an invalid password', async () => {
      userService.findById.mockResolvedValue(buildUser());

      await expect(
        service.createProof(1, { password: 'wrong' } as StepUpDto),
      ).rejects.toMatchObject({
        constructor: AppException,
      });
    });

    it('requires at least one credential', async () => {
      userService.findById.mockResolvedValue(buildUser());

      await expect(service.createProof(1, {} as StepUpDto)).rejects.toThrow(
        AppException,
      );
    });

    it('throws when the user does not exist', async () => {
      userService.findById.mockResolvedValue(null);

      await expect(
        service.createProof(1, { password } as StepUpDto),
      ).rejects.toThrow(AppException);
    });
  });

  describe('assertValidProof', () => {
    const signProof = (sub: number, expiresIn: number | string = 300) =>
      jwtService.sign(
        { sub, purpose: STEP_UP_TOKEN_PURPOSE },
        { expiresIn: expiresIn as any },
      );

    it('accepts a fresh proof for the same user', () => {
      const token = signProof(1);
      expect(() => service.assertValidProof(1, token)).not.toThrow();
    });

    it('rejects a missing proof with AUTH_STEP_UP_REQUIRED', () => {
      try {
        service.assertValidProof(1, undefined);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        expect((err as AppException).getResponse()).toMatchObject({
          code: ErrorCode.AUTH_STEP_UP_REQUIRED,
        });
      }
    });

    it('rejects an expired proof with AUTH_STEP_UP_EXPIRED', () => {
      const token = signProof(1, '-1s');
      try {
        service.assertValidProof(1, token);
        fail('expected throw');
      } catch (err) {
        expect((err as AppException).getResponse()).toMatchObject({
          code: ErrorCode.AUTH_STEP_UP_EXPIRED,
        });
      }
    });

    it('rejects a proof issued for a different user', () => {
      const token = signProof(2);
      try {
        service.assertValidProof(1, token);
        fail('expected throw');
      } catch (err) {
        expect((err as AppException).getResponse()).toMatchObject({
          code: ErrorCode.AUTH_STEP_UP_INVALID,
        });
      }
    });

    it('rejects a token without the step-up purpose', () => {
      const sessionLike = jwtService.sign({ sub: 1, username: 'a' });
      try {
        service.assertValidProof(1, sessionLike);
        fail('expected throw');
      } catch (err) {
        expect((err as AppException).getResponse()).toMatchObject({
          code: ErrorCode.AUTH_STEP_UP_INVALID,
        });
      }
    });

    it('rejects a garbage token as invalid', () => {
      try {
        service.assertValidProof(1, 'not-a-jwt');
        fail('expected throw');
      } catch (err) {
        expect((err as AppException).getResponse()).toMatchObject({
          code: ErrorCode.AUTH_STEP_UP_INVALID,
        });
      }
    });
  });
});
