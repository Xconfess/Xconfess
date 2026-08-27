/**
 * Unit tests for the canonical auth DTOs.
 *
 * These tests run without spinning up NestJS: they use class-transformer's
 * plainToInstance() for @Transform application and class-validator's
 * validate() for constraint checking, keeping them fast and isolated.
 *
 * Acceptance criteria (issue #597):
 * - One authoritative DTO set for login/register payloads.
 * - Email normalisation (@Transform) behaves consistently for both DTOs.
 * - LoginDto: minimal password validation (no complexity leak on login).
 * - RegisterDto: full password complexity + username constraints enforced.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getErrors(instance: any) {
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints || {}));
}

// ─── LoginDto ─────────────────────────────────────────────────────────────────

describe('LoginDto', () => {
  describe('email normalisation', () => {
    it('lowercases and trims the email before validation', async () => {
      const dto = plainToInstance(LoginDto, {
        email: '  User@Example.COM  ',
        password: 'anypassword',
      });
      expect(dto.email).toBe('user@example.com');
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a correctly formatted lowercase email', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'user@example.com',
        password: 'anypassword',
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('email validation', () => {
    it('rejects an invalid email format', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'not-an-email',
        password: 'anypassword',
      });
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('valid e-mail'))).toBe(true);
    });

    it('rejects an empty email', async () => {
      const dto = plainToInstance(LoginDto, {
        email: '',
        password: 'anypassword',
      });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('password validation', () => {
    it('rejects an empty password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'user@example.com',
        password: '',
      });
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('must not be empty'))).toBe(true);
    });

    it('accepts any non-empty password (no complexity check on login)', async () => {
      // Intentional: complexity rules must not be enforced on login to avoid
      // leaking password policy information to attackers.
      const dto = plainToInstance(LoginDto, {
        email: 'user@example.com',
        password: 'simple',
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

// ─── RegisterDto ──────────────────────────────────────────────────────────────

describe('RegisterDto', () => {
  const validPayload = {
    email: 'user@example.com',
    password: 'Valid1@password',
    username: 'testuser',
  };

  describe('email normalisation', () => {
    it('lowercases and trims the email before validation', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          email: '  User@Example.COM  ',
        }),
      );
      expect(dto.email).toBe('user@example.com');
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('email validation', () => {
    it('rejects an invalid email format', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          email: 'bad-email',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('valid e-mail'))).toBe(true);
    });
  });

  describe('password validation', () => {
    it('accepts a strong password', async () => {
      const dto = plainToInstance(RegisterDto, validPayload);
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'Ab1@',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('at least 8'))).toBe(true);
    });

    it('rejects a password longer than 72 characters', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'Aa1@' + 'a'.repeat(72),
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('at most 72'))).toBe(true);
    });

    it('rejects a password without uppercase', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'valid1@password',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('uppercase'))).toBe(true);
    });

    it('rejects a password without lowercase', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'VALID1@PASSWORD',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('lowercase'))).toBe(true);
    });

    it('rejects a password without a digit', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'Valid@password',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('digit'))).toBe(true);
    });

    it('rejects a password without a special character', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          password: 'Valid1password',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('special'))).toBe(true);
    });
  });

  describe('username validation', () => {
    it('accepts a valid alphanumeric username', async () => {
      const dto = plainToInstance(RegisterDto, validPayload);
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a username with underscores', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: 'test_user_123',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a username shorter than 3 characters', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: 'ab',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('at least 3'))).toBe(true);
    });

    it('rejects a username longer than 30 characters', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: 'a'.repeat(31),
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.some((m) => m.includes('at most 30'))).toBe(true);
    });

    it('rejects a username with hyphens', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: 'test-user',
        }),
      );
      const errors = await getErrors(dto);
      expect(
        errors.some((m) => m.includes('letters, numbers, and underscores')),
      ).toBe(true);
    });

    it('rejects a username with spaces', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: 'test user',
        }),
      );
      const errors = await getErrors(dto);
      expect(
        errors.some((m) => m.includes('letters, numbers, and underscores')),
      ).toBe(true);
    });

    it('rejects an empty username', async () => {
      const dto = plainToInstance(
        RegisterDto,
        Object.assign({}, validPayload, {
          username: '',
        }),
      );
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
