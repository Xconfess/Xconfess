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
});
