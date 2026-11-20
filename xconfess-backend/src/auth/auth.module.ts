import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout.service';
import { SessionRevocationService } from './session-revocation.service';
import { CacheModule } from '../cache/cache.module';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { StepUpService } from './step-up.service';
import { StepUpGuard } from './guards/step-up.guard';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';
import { PasswordReset } from './entities/password-reset.entity';
import { UserRecoveryCode } from './entities/user-recovery-code.entity';
import { User } from '../user/entities/user.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RecoveryCodeService } from './recovery-code.service';
import {
  AdminTwoFactorRecoveryController,
  TwoFactorRecoveryController,
} from './two-factor-recovery.controller';
import { createJwtSecretProvider } from './jwt-secret-rotation';

@Module({
  imports: [
    forwardRef(() => UserModule),
    CacheModule,
    EmailModule,
    PassportModule,
    AuditLogModule,
    TypeOrmModule.forFeature([PasswordReset, UserRecoveryCode, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        secretOrKeyProvider: createJwtSecretProvider(configService),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [
    AuthController,
    TwoFactorRecoveryController,
    AdminTwoFactorRecoveryController,
  ],
  providers: [
    LockoutService,
    AuthService,
    SessionRevocationService,
    JwtStrategy,
    PasswordResetService,
    StepUpService,
    StepUpGuard,
    OptionalJwtAuthGuard,
    RecoveryCodeService,
  ],
  exports: [
    RecoveryCodeService,
    AuthService,
    LockoutService,
    SessionRevocationService,
    JwtModule,
    StepUpService,
    StepUpGuard,
    OptionalJwtAuthGuard,
  ],
})
export class AuthModule {}
