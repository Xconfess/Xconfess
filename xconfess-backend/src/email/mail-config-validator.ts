import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class MailConfigValidator implements OnModuleInit {
  private readonly logger = new Logger(MailConfigValidator.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.validateMailConfig();
  }

  validateMailConfig(): MailConfigValidationResult {
    const result: MailConfigValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const isDev =
      !process.env.NODE_ENV ||
      ['development', 'dev', 'local'].includes(process.env.NODE_ENV);

    const host = this.configService.get<string>('mail.primary.host');
    const port = this.configService.get<string>('mail.primary.port');
    const user = this.configService.get<string>('mail.primary.auth.user');
    const pass = this.configService.get<string>('mail.primary.auth.pass');
    const from = this.configService.get<string>('mail.primary.from');

    if (!host) {
      result.errors.push('MAIL_HOST is not configured');
      result.valid = false;
    }

    if (!port) {
      result.errors.push('MAIL_PORT is not configured');
      result.valid = false;
    }

    if (!user) {
      result.errors.push('MAIL_USER is not configured');
      result.valid = false;
    }

    if (!pass) {
      result.errors.push('MAIL_PASS is not configured');
      result.valid = false;
    }

    if (!from) {
      result.errors.push('MAIL_FROM is not configured');
      result.valid = false;
    }

    const fallbackHost = this.configService.get<string>('mail.fallback.host');
    if (fallbackHost && !result.valid) {
      result.warnings.push(
        'Fallback mail provider is configured but primary provider has missing settings',
      );
    }

    const deprecatedVars = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ];

    const foundDeprecated = deprecatedVars.filter(
      (v) => process.env[v] !== undefined,
    );

    if (foundDeprecated.length > 0) {
      result.warnings.push(
        `Deprecated mail env vars detected: ${foundDeprecated.join(', ')}. Use MAIL_* naming convention.`,
      );
    }

    if (result.valid) {
      this.logger.log('Mail configuration validated successfully');
    } else {
      const msg = `Mail configuration has errors: ${result.errors.join(', ')}`;
      if (isDev) {
        this.logger.warn(
          `${msg} — Email features will be disabled, but the app can continue in local development. Set MAIL_HOST, MAIL_USER, MAIL_PASSWORD, etc. in .env to enable email.`,
        );
      } else {
        this.logger.error(msg);
      }
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((w) => this.logger.warn(w));
    }

    return result;
  }

  isMailConfigured(): boolean {
    const host = this.configService.get<string>('mail.primary.host');
    const user = this.configService.get<string>('mail.primary.auth.user');
    const pass = this.configService.get<string>('mail.primary.auth.pass');
    return !!(host && user && pass);
  }

  getConfig(): MailConfigValidationResult {
    return this.validateMailConfig();
  }
}
