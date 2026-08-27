import * as Joi from 'joi';
import { envValidationSchema } from './env.validation';

describe('Environment Validation', () => {
  const baseConfig = {
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'test',
    DB_PASSWORD: 'test',
    DB_NAME: 'test',
    JWT_SECRET: 'a'.repeat(32),
    ENCRYPTION_MASTER_KEY_v1:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  const validKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('should validate a correct configuration', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
    };
    const { error, value } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
    expect(value.CONFESSION_ENCRYPTION_KEY).toBe(validKey);
  });

  it('should fail if CONFESSION_ENCRYPTION_KEY is missing', () => {
    const config = { ...baseConfig };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error.message).toContain('CONFESSION_ENCRYPTION_KEY is required');
  });

  it('should fail if CONFESSION_ENCRYPTION_KEY is not 64 characters', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: 'abc123',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error.message).toContain(
      'CONFESSION_ENCRYPTION_KEY must be exactly 64 characters',
    );
  });

  it('should fail if CONFESSION_ENCRYPTION_KEY is not hex', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: 'z'.repeat(64),
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error.message).toContain(
      'CONFESSION_ENCRYPTION_KEY must be a valid hexadecimal string',
    );
  });

  it('should allow boot without contract IDs when Stellar features are disabled', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
      STELLAR_FEATURES_ENABLED: 'false',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
  });

  it('should require contract IDs when Stellar features are enabled', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
      STELLAR_FEATURES_ENABLED: 'true',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error!.message).toContain('CONFESSION_ANCHOR_CONTRACT_ID');
    expect(error!.message).toContain('REPUTATION_BADGES_CONTRACT_ID');
    expect(error!.message).toContain('TIPPING_SYSTEM_CONTRACT_ID');
  });

  it('should pass when Stellar features are enabled and all contract IDs are set', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
      STELLAR_FEATURES_ENABLED: 'true',
      CONFESSION_ANCHOR_CONTRACT_ID: 'CANCHOR',
      REPUTATION_BADGES_CONTRACT_ID: 'CBADGES',
      TIPPING_SYSTEM_CONTRACT_ID: 'CTIP',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
  });

  it('should fail if JWT_SECRET is shorter than 32 characters', () => {
    const config = {
      ...baseConfig,
      JWT_SECRET: 'short-secret',
      CONFESSION_ENCRYPTION_KEY: validKey,
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error!.message).toContain(
      'JWT_SECRET must be at least 32 characters long',
    );
  });

  it('should fail boot in production if APP_SECRET is missing', () => {
    const config = {
      ...baseConfig,
      NODE_ENV: 'production',
      CONFESSION_ENCRYPTION_KEY: validKey,
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error!.message).toContain('APP_SECRET is required');
  });

  it('should fail boot in staging if APP_SECRET is too short', () => {
    const config = {
      ...baseConfig,
      NODE_ENV: 'staging',
      CONFESSION_ENCRYPTION_KEY: validKey,
      APP_SECRET: 'too-short',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
    expect(error!.message).toContain(
      'APP_SECRET must be at least 32 characters long',
    );
  });

  it('should pass in production when APP_SECRET meets the minimum length', () => {
    const config = {
      ...baseConfig,
      NODE_ENV: 'production',
      CONFESSION_ENCRYPTION_KEY: validKey,
      APP_SECRET: 'a'.repeat(32),
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
  });

  it('should allow APP_SECRET to be omitted in development', () => {
    const config = {
      ...baseConfig,
      NODE_ENV: 'development',
      CONFESSION_ENCRYPTION_KEY: validKey,
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
  });
});
