import { maskUserId } from '../utils/mask-user-id';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  GoneException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { PasswordResetService } from './password-reset.service';
import { AnonymousUserService } from '../user/anonymous-user.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { UserResponse } from '../user/dto/user-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { CryptoUtil } from '../common/crypto.util';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole } from '../user/entities/user.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';
import { getDefaultAdminStellarInvocationScopes } from '../stellar/stellar-invocation-policy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private totpAttempts = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private passwordResetService: PasswordResetService,
    private anonymousUserService: AnonymousUserService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserResponse | null> {
    const user = await this.userService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      if (!user.is_active) {
        throw new AppException(
          'Account is deactivated. Please reactivate your account to continue.',
          ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
          HttpStatus.UNAUTHORIZED,
        );
      }
      const decryptedEmail = CryptoUtil.decrypt(
        user.emailEncrypted,
        user.emailIv,
        user.emailTag,
      );
      // resetPasswordToken and resetPasswordExpires are internal — never sent to clients.
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        email: decryptedEmail,
        notificationPreferences: user.notificationPreferences || {},
        privacy: {
          isDiscoverable: user.isDiscoverable(),
          canReceiveReplies: user.canReceiveReplies(),
          showReactions: user.shouldShowReactions(),
          dataProcessingConsent: user.hasDataProcessingConsent(),
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        is2faEnabled: Boolean(user.is2faEnabled),
      };
    }
    return null;
  }

  async login(
    email: string,
    password: string,
    totpCode?: string,
    recoveryCode?: string,
  ): Promise<{
    access_token: string;
    user: UserResponse;
    anonymousUserId: string;
  }> {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new AppException(
        'Invalid credentials',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userEntity = await this.userService.findByEmail(email);
    if (!userEntity) {
      throw new AppException(
        'User not found',
        ErrorCode.NOT_FOUND,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const requires2fa =
      userEntity.is2faEnabled ||
      (userEntity.role === UserRole.ADMIN &&
        process.env.REQUIRE_ADMIN_2FA === 'true');

    if (requires2fa) {
      const now = Date.now();
      const rateKey = `totp:${userEntity.id}`;
      const attemptData = this.totpAttempts.get(rateKey);
      if (attemptData) {
        if (now > attemptData.resetTime) {
          this.totpAttempts.delete(rateKey);
        } else if (attemptData.count >= 5) {
          throw new AppException(
            'Too many TOTP verification attempts. Please try again later.',
            ErrorCode.RATE_LIMIT_EXCEEDED,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      if (!totpCode && !recoveryCode) {
        throw new AppException(
          '2FA verification required',
          ErrorCode.AUTH_2FA_REQUIRED,
          HttpStatus.UNAUTHORIZED,
        );
      }

      let validCode = false;
      if (totpCode) {
        if (!userEntity.totpSecret) {
          throw new AppException(
            '2FA setup required for this account',
            ErrorCode.AUTH_2FA_REQUIRED,
            HttpStatus.UNAUTHORIZED,
          );
        }
        validCode = speakeasy.totp.verify({
          secret: userEntity.totpSecret,
          encoding: 'base32',
          token: totpCode,
          window: 1,
        });
      } else if (recoveryCode && userEntity.totpRecoveryCodes) {
        const hashedInput = crypto
          .createHash('sha256')
          .update(recoveryCode.trim())
          .digest('hex');
        const index = userEntity.totpRecoveryCodes.indexOf(hashedInput);
        if (index !== -1) {
          validCode = true;
          userEntity.totpRecoveryCodes.splice(index, 1);
          await this.userService.saveUser(userEntity);
        }
      }

      if (!validCode) {
        const currentCount = (this.totpAttempts.get(rateKey)?.count || 0) + 1;
        this.totpAttempts.set(rateKey, {
          count: currentCount,
          resetTime:
            this.totpAttempts.get(rateKey)?.resetTime || Date.now() + 60000,
        });
        throw new AppException(
          'Invalid 2FA verification code',
          ErrorCode.AUTH_2FA_INVALID,
          HttpStatus.UNAUTHORIZED,
        );
      } else {
        this.totpAttempts.delete(rateKey);
      }
    }

    const anonymousUser =
      await this.anonymousUserService.getOrCreateForUserSession(user.id);
    const role = user.role || UserRole.USER;
    const scopes =
      role === UserRole.ADMIN ? getDefaultAdminStellarInvocationScopes() : [];
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      username: user.username,
      role,
      scopes,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user,
      anonymousUserId: anonymousUser.id,
    };
  }

  async setupTotp(userId: number): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppException('User not found', ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const secret = speakeasy.generateSecret({
      name: `Xconfess (${user.username})`,
    });
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url || '');
    user.pendingTotpSecret = secret.base32;
    await this.userService.saveUser(user);
    return { secret: secret.base32, qrCodeUrl };
  }

  async enableTotp(userId: number, totpCode: string): Promise<{ recoveryCodes: string[]; message: string }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppException('User not found', ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const now = Date.now();
    const rateKey = `totp_enable:${userId}`;
    const attemptData = this.totpAttempts.get(rateKey);
    if (attemptData) {
      if (now > attemptData.resetTime) {
        this.totpAttempts.delete(rateKey);
      } else if (attemptData.count >= 5) {
        throw new AppException(
          'Too many TOTP verification attempts. Please try again later.',
          ErrorCode.RATE_LIMIT_EXCEEDED,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (!user.pendingTotpSecret) {
      throw new AppException(
        'TOTP setup has not been initiated. Call setup first.',
        ErrorCode.BAD_REQUEST,
        HttpStatus.BAD_REQUEST,
      );
    }

    const isValid = speakeasy.totp.verify({
      secret: user.pendingTotpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      const currentCount = (this.totpAttempts.get(rateKey)?.count || 0) + 1;
      this.totpAttempts.set(rateKey, {
        count: currentCount,
        resetTime: this.totpAttempts.get(rateKey)?.resetTime || Date.now() + 60000,
      });
      throw new AppException(
        'Invalid TOTP verification code',
        ErrorCode.AUTH_2FA_INVALID,
        HttpStatus.UNAUTHORIZED,
      );
    }

    this.totpAttempts.delete(rateKey);

    const recoveryCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = `${crypto.randomBytes(4).toString('hex')}-${i}`;
      recoveryCodes.push(code);
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      hashedCodes.push(hash);
    }

    user.totpSecret = user.pendingTotpSecret;
    user.pendingTotpSecret = null;
    user.totpRecoveryCodes = hashedCodes;
    user.is2faEnabled = true;
    await this.userService.saveUser(user);

    return {
      recoveryCodes,
      message: '2FA enabled successfully',
    };
  }

  async disableTotp(userId: number, password: string): Promise<{ message: string }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppException('User not found', ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppException(
        'Invalid password',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }
    user.is2faEnabled = false;
    user.totpSecret = null;
    user.pendingTotpSecret = null;
    user.totpRecoveryCodes = null;
    await this.userService.saveUser(user);
    return { message: '2FA disabled successfully' };
  }

  async generateResetPasswordToken(email: string): Promise<string> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new AppException(
        'Email not found',
        ErrorCode.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Token stored internally — never returned to caller or serialized to HTTP response.
    await this.userService.setResetPasswordToken(user.id, token, expiresAt);
    return token;
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    try {
      const { reset, reason } =
        await this.passwordResetService.consumeValidToken(token);

      if (!reset) {
        this.logger.warn(`Reset token rejected`, { token, reason });

        switch (reason) {
          case 'invalid':
            throw new AppException(
              'Invalid reset token',
              ErrorCode.AUTH_TOKEN_INVALID,
              HttpStatus.BAD_REQUEST,
            );
          case 'expired':
            throw new AppException(
              'Reset token expired',
              ErrorCode.AUTH_SESSION_EXPIRED,
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          case 'reused':
            throw new AppException(
              'Reset token already used',
              ErrorCode.RESOURCE_GONE,
              HttpStatus.GONE,
            );
          default:
            throw new AppException(
              'Invalid reset token',
              ErrorCode.AUTH_TOKEN_INVALID,
              HttpStatus.BAD_REQUEST,
            );
        }
      }

      await this.userService.updatePassword(reset.userId, newPassword);

      this.logger.log(`Password reset successful`, {
        maskedUserId: maskUserId(reset.userId),
        tokenId: reset.id,
      });

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (
        error instanceof AppException ||
        error instanceof BadRequestException ||
        error instanceof GoneException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      this.logger.error(`Password reset failed: ${errorMessage}`, {
        token,
        error: errorMessage,
      });
      throw new AppException(
        'Failed to reset password',
        ErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateUserById(userId: number): Promise<UserResponse | null> {
    const user = await this.userService.findById(userId);
    if (user && user.is_active) {
      const decryptedEmail = CryptoUtil.decrypt(
        user.emailEncrypted,
        user.emailIv,
        user.emailTag,
      );
      // resetPasswordToken and resetPasswordExpires are internal — never sent to clients.
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        email: decryptedEmail,
        notificationPreferences: user.notificationPreferences || {},
        privacy: {
          isDiscoverable: user.isDiscoverable(),
          canReceiveReplies: user.canReceiveReplies(),
          showReactions: user.shouldShowReactions(),
          dataProcessingConsent: user.hasDataProcessingConsent(),
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        is2faEnabled: Boolean(user.is2faEnabled),
      };
    }
    return null;
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    try {
      if (!ForgotPasswordDto.validate(forgotPasswordDto)) {
        throw new AppException(
          'Either email or userId must be provided',
          ErrorCode.BAD_REQUEST,
          HttpStatus.BAD_REQUEST,
        );
      }

      let user;

      if (forgotPasswordDto.email) {
        user = await this.userService.findByEmail(forgotPasswordDto.email);
        this.logger.log(`Password reset requested for email: [PROTECTED]`, {
          email: '[PROTECTED]',
          ipAddress,
        });
      } else if (forgotPasswordDto.userId) {
        user = await this.userService.findById(forgotPasswordDto.userId);
        this.logger.log(
          `Password reset requested for masked user ID: ${maskUserId(forgotPasswordDto.userId)}`,
          { maskedUserId: maskUserId(forgotPasswordDto.userId), ipAddress },
        );
      }

      if (!user) {
        this.logger.warn(`Password reset attempted for non-existent user`, {
          maskedUserId: forgotPasswordDto.userId
            ? maskUserId(forgotPasswordDto.userId)
            : undefined,
          ipAddress,
        });
        return {
          message: 'If the user exists, a password reset email has been sent.',
        };
      }

      await this.passwordResetService.invalidateUserTokens(user.id);

      const token = await this.passwordResetService.createResetToken(
        user.id,
        ipAddress,
        userAgent,
      );

      await this.emailService.sendPasswordResetEmail(
        CryptoUtil.decrypt(user.emailEncrypted, user.emailIv, user.emailTag),
        token,
        user.username,
      );

      this.logger.log(`Password reset email sent successfully`, {
        maskedUserId: maskUserId(user.id),
        ipAddress,
        userAgent,
      });

      return {
        message: 'If the user exists, a password reset email has been sent.',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Forgot password process failed: ${errorMessage}`, {
        maskedUserId: forgotPasswordDto.userId
          ? maskUserId(forgotPasswordDto.userId)
          : undefined,
        ipAddress,
        error: errorMessage,
      });

      return {
        message: 'If the user exists, a password reset email has been sent.',
      };
    }
  }
}
