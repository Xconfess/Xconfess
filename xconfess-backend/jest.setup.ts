import { Logger } from '@nestjs/common';

if (process.env.XCONFESS_TEST_LOGS !== 'true') {
  Logger.overrideLogger(false);
  const noop = () => undefined;
  Logger.prototype.log = noop;
  Logger.prototype.error = noop;
  Logger.prototype.warn = noop;
  Logger.prototype.debug = noop;
  Logger.prototype.verbose = noop;
}

// Global test env defaults for crypto utilities.
// These keys are ONLY for tests.
process.env.EMAIL_ENCRYPTION_KEY =
  process.env.EMAIL_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 bytes
process.env.CONFESSION_ENCRYPTION_KEY =
  process.env.CONFESSION_ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.DB_NAME = process.env.DB_NAME || 'xconfess_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.TYPEORM_SYNCHRONIZE = process.env.TYPEORM_SYNCHRONIZE || 'false';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
