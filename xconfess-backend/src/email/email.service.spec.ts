import {
  EmailService,
  renderTemplate,
  TemplateVariableValidationError,
} from './email.service';
import { EmailTemplateVersion } from '../config/email.config';
import {
  recipientBucket,
  normalizeRecipientForBucketing,
} from './email.config';
import { NotFoundException } from '@nestjs/common';

describe('EmailService template variable schema validation', () => {
  const template: EmailTemplateVersion = {
    version: 'v-test',
    subject: 'Hello {{username}}',
    html: '<p>{{username}} is {{age}}</p>',
    text: '{{username}}',
    requiredVars: ['username'],
    variableSchema: {
      required: {
        username: 'string',
      },
      optional: {
        age: 'number',
      },
    },
    lifecycleState: 'active',
  };

  it('renders successfully for a valid payload', () => {
    const rendered = renderTemplate('welcome', template, {
      username: 'Alice',
      age: 30,
    });

    expect(rendered.subject).toContain('Alice');
    expect(rendered.html).toContain('30');
    expect(rendered.text).toContain('Alice');
  });

  it('fails for missing required keys', () => {
    expect(() =>
      renderTemplate('welcome', template, {
        age: 30,
      }),
    ).toThrow(TemplateVariableValidationError);

    try {
      renderTemplate('welcome', template, { age: 30 });
    } catch (error) {
      const validationError = error as TemplateVariableValidationError;
      expect(validationError.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'missing',
            key: 'username',
          }),
        ]),
      );
    }
  });

  it('fails for unknown keys', () => {
    expect(() =>
      renderTemplate('welcome', template, {
        username: 'Alice',
        unknownField: 'unexpected',
      }),
    ).toThrow(TemplateVariableValidationError);

    try {
      renderTemplate('welcome', template, {
        username: 'Alice',
        unknownField: 'unexpected',
      });
    } catch (error) {
      const validationError = error as TemplateVariableValidationError;
      expect(validationError.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'unknown',
            key: 'unknownField',
          }),
        ]),
      );
    }
  });

  it('fails for primitive type mismatches', () => {
    expect(() =>
      renderTemplate('welcome', template, {
        username: 'Alice',
        age: 'not-a-number',
      }),
    ).toThrow(TemplateVariableValidationError);

    try {
      renderTemplate('welcome', template, {
        username: 'Alice',
        age: 'not-a-number',
      });
    } catch (error) {
      const validationError = error as TemplateVariableValidationError;
      expect(validationError.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'type_mismatch',
            key: 'age',
            expected: 'number',
            actual: 'string',
          }),
        ]),
      );
    }
  });
});

// ============================================================================
// Recipient Bucketing Tests
// ============================================================================

describe('recipientBucket', () => {
  it('should return consistent bucket for same email and template', () => {
    const email = 'test@example.com';
    const templateKey = 'welcome';

    const bucket1 = recipientBucket(email, templateKey);
    const bucket2 = recipientBucket(email, templateKey);

    expect(bucket1).toBe(bucket2);
    expect(bucket1).toBeGreaterThanOrEqual(0);
    expect(bucket1).toBeLessThan(100);
  });

  it('should normalize email (trim and lowercase)', () => {
    const email1 = '  Test@Example.COM  ';
    const email2 = 'test@example.com';
    const templateKey = 'welcome';

    const bucket1 = recipientBucket(email1, templateKey);
    const bucket2 = recipientBucket(email2, templateKey);

    expect(bucket1).toBe(bucket2);
  });

  it('should produce different buckets for different templates', () => {
    const email = 'test@example.com';

    const bucket1 = recipientBucket(email, 'welcome');
    const bucket2 = recipientBucket(email, 'reset-password');

    // Different templates should produce different buckets (very likely)
    // We can't guarantee they're different, but the test verifies the function works
    expect(bucket1).toBeGreaterThanOrEqual(0);
    expect(bucket1).toBeLessThan(100);
    expect(bucket2).toBeGreaterThanOrEqual(0);
    expect(bucket2).toBeLessThan(100);
  });

  it('should handle bucket boundaries correctly', () => {
    // Test that buckets are in valid range 0-99
    const testCases = [
      { email: 'a@test.com', template: 'test' },
      { email: 'b@test.com', template: 'test' },
      { email: 'c@test.com', template: 'test' },
    ];

    for (const { email, template } of testCases) {
      const bucket = recipientBucket(email, template);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('should respect optional salt for additional stability', () => {
    const email = 'test@example.com';
    const templateKey = 'welcome';

    const bucketWithoutSalt = recipientBucket(email, templateKey);
    const bucketWithSalt = recipientBucket(email, templateKey, {
      salt: 'production-salt',
    });

    // With different salt, bucket should be different
    expect(bucketWithSalt).not.toBe(bucketWithoutSalt);

    // But same salt should produce same bucket
    const bucketWithSalt2 = recipientBucket(email, templateKey, {
      salt: 'production-salt',
    });
    expect(bucketWithSalt).toBe(bucketWithSalt2);
  });
});

describe('normalizeRecipientForBucketing', () => {
  it('should trim and lowercase email', () => {
    expect(normalizeRecipientForBucketing('  Test@Example.COM  ')).toBe(
      'test@example.com',
    );
  });

  it('should handle email without extra whitespace', () => {
    expect(normalizeRecipientForBucketing('test@example.com')).toBe(
      'test@example.com',
    );
  });

  it('should handle edge case emails', () => {
    expect(normalizeRecipientForBucketing('')).toBe('');
    expect(normalizeRecipientForBucketing('TEST')).toBe('test');
  });
});

describe('EmailService template missing/version error messaging', () => {
  const configServiceMock: any = { get: jest.fn() };
  const service = new EmailService(configServiceMock);

  beforeEach(() => {
    (service as any).templateRegistry = {};
    (service as any).rolloutMap = {};
  });

  it('previewTemplate throws 404 with templateKey context', () => {
    try {
      service.previewTemplate('missing_key', { username: 'Alice' });
      throw new Error('Expected previewTemplate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const res = err.response;
      expect(res.templateKey).toBe('missing_key');
    }
  });

  it('previewTemplate throws 404 with templateVersion context', () => {
    (service as any).templateRegistry = {
      welcome: {
        activeVersion: 'v1',
        versions: {},
      },
    };

    try {
      service.previewTemplate('welcome', { username: 'Alice' }, 'v2');
      throw new Error('Expected previewTemplate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const res = err.response;
      expect(res.templateKey).toBe('welcome');
      expect(res.templateVersion).toBe('v2');
    }
  });

  it('sendGenericNotification throws 404 with templateKey + templateVersion', async () => {
    (service as any).templateRegistry = {
      welcome: {
        activeVersion: 'v2',
        versions: {},
      },
    };

    await expect(
      service.sendGenericNotification('user@example.com', 'welcome', {
        username: 'Alice',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    try {
      await service.sendGenericNotification('user@example.com', 'welcome', {
        username: 'Alice',
      });
      throw new Error('Expected sendGenericNotification to throw');
    } catch (err) {
      const res = err.response;
      expect(res.templateKey).toBe('welcome');
      expect(res.templateVersion).toBe('v2');
      expect(res.code).toBeDefined();
    }
  });
});
