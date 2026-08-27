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
import { LockoutService } from './lockout.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
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

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private passwordResetService: PasswordResetService,
    private anonymousUserService: AnonymousUserService,
    private lockoutService: LockoutService,
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
      // resetPasswordToken and resetPasswordExpires are internal â€” never sent to clients.
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
      };
    }
    return null;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    access_token: string;
    user: UserResponse;
    anonymousUserId: string;
  }> {
    // Check lockout before validating credentials
    const lockStatus = await this.lockoutService.getStatus(email);
    if (lockStatus.isLocked) {
      throw new AppException(
        'Too many failed login attempts. Please try again later.',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.validateUser(email, password);
    if (!user) {
      await this.lockoutService.recordFailedAttempt(email);
      throw new AppException(
        'Invalid credentials',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.lockoutService.clearLockout(email);
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

    // Token stored internally â€” never returned to caller or serialized to HTTP response.
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
      // resetPasswordToken and resetPasswordExpires are internal â€” never sent to clients.
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

