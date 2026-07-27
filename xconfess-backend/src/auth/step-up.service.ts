import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenExpiredError } from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import { UserService } from '../user/user.service';
import { CryptoUtil } from '../common/crypto.util';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { StepUpDto } from './dto/step-up.dto';

/**
 * Marks a JWT as a step-up (re-authentication) proof rather than a full
 * session token. Session tokens never carry this claim, and the step-up guard
 * only accepts tokens that do — so the two can never be used interchangeably.
 */
export const STEP_UP_TOKEN_PURPOSE = 'step_up';

const DEFAULT_STEP_UP_TTL_SECONDS = 300; // 5 minutes

interface StepUpProofPayload {
  sub: number;
  purpose: typeof STEP_UP_TOKEN_PURPOSE;
}

export interface StepUpProofResult {
  stepUpToken: string;
  expiresIn: number;
}

/**
 * Issues and validates short-lived "step-up" proofs. A stolen admin session
 * alone is not enough to perform destructive actions — the admin must recently
 * re-prove control of the account with a password or TOTP code, and that proof
 * expires quickly.
 */
@Injectable()
export class StepUpService {
  private readonly logger = new Logger(StepUpService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    const configured = parseInt(
      this.configService.get<string>('STEP_UP_PROOF_TTL_SECONDS') ?? '',
      10,
    );
    this.ttlSeconds =
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_STEP_UP_TTL_SECONDS;
  }

  /**
   * Verify a fresh credential (password or TOTP) for the given user and mint a
   * short-lived step-up proof. Throws on any verification failure.
   */
  async createProof(
    userId: number,
    dto: StepUpDto,
  ): Promise<StepUpProofResult> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppException(
        'User not found',
        ErrorCode.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    let verified = false;

    if (dto.totpToken) {
      verified = this.verifyTotp(user, dto.totpToken);
    } else if (dto.password) {
      verified = await bcrypt.compare(dto.password, user.password);
    } else {
      throw new AppException(
        'Either password or totpToken must be provided',
        ErrorCode.MISSING_PARAMETER,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!verified) {
      this.logger.warn({
        event: 'STEP_UP_VERIFICATION_FAILED',
        userId,
        method: dto.totpToken ? 'totp' : 'password',
      });
      throw new AppException(
        'Step-up verification failed',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload: StepUpProofPayload = {
      sub: userId,
      purpose: STEP_UP_TOKEN_PURPOSE,
    };
    const stepUpToken = this.jwtService.sign(payload, {
      expiresIn: this.ttlSeconds,
    });

    return { stepUpToken, expiresIn: this.ttlSeconds };
  }

  /**
   * Assert that `token` is a valid, unexpired step-up proof belonging to
   * `userId`. Throws an {@link AppException} with a distinct error code the
   * frontend can react to (prompt for re-auth vs. hard failure) otherwise.
   */
  assertValidProof(userId: number, token?: string): void {
    if (!token) {
      throw new AppException(
        'Step-up authentication is required for this action',
        ErrorCode.AUTH_STEP_UP_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    let payload: StepUpProofPayload;
    try {
      payload = this.jwtService.verify<StepUpProofPayload>(token);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new AppException(
          'Step-up proof has expired — please re-authenticate',
          ErrorCode.AUTH_STEP_UP_EXPIRED,
          HttpStatus.FORBIDDEN,
        );
      }
      throw new AppException(
        'Invalid step-up proof',
        ErrorCode.AUTH_STEP_UP_INVALID,
        HttpStatus.FORBIDDEN,
      );
    }

    if (payload.purpose !== STEP_UP_TOKEN_PURPOSE || payload.sub !== userId) {
      throw new AppException(
        'Invalid step-up proof',
        ErrorCode.AUTH_STEP_UP_INVALID,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private verifyTotp(
    user: {
      totpEnabled?: boolean;
      totpSecretEncrypted?: string | null;
      totpSecretIv?: string | null;
      totpSecretTag?: string | null;
    },
    token: string,
  ): boolean {
    if (
      !user.totpEnabled ||
      !user.totpSecretEncrypted ||
      !user.totpSecretIv ||
      !user.totpSecretTag
    ) {
      throw new AppException(
        'TOTP is not configured for this account',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    let secret: string;
    try {
      secret = CryptoUtil.decrypt(
        user.totpSecretEncrypted,
        user.totpSecretIv,
        user.totpSecretTag,
      );
    } catch {
      throw new AppException(
        'Failed to verify TOTP token',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }
}
