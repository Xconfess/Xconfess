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
    JWT_SECRET: 'testsecret123',
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

  it('should default ENABLE_SWAGGER to false when not set', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
    };
    const { error, value } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
    expect(value.ENABLE_SWAGGER).toBe('false');
  });

  it('should allow ENABLE_SWAGGER to be explicitly enabled', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
      ENABLE_SWAGGER: 'true',
    };
    const { error, value } = envValidationSchema.validate(config);
    expect(error).toBeUndefined();
    expect(value.ENABLE_SWAGGER).toBe('true');
  });

  it('should reject a non-boolean-like value for ENABLE_SWAGGER', () => {
    const config = {
      ...baseConfig,
      CONFESSION_ENCRYPTION_KEY: validKey,
      ENABLE_SWAGGER: 'yes',
    };
    const { error } = envValidationSchema.validate(config);
    expect(error).toBeDefined();
  });
});
