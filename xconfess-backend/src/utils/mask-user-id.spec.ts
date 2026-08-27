import { maskUserId, UserIdMasker } from './mask-user-id';

describe('maskUserId', () => {
  it('should return a masked user ID for a string user ID', () => {
    const masked = maskUserId('user123');
    expect(masked).toMatch(/^user_[a-f0-9]{12}$/);
  });

  it('should return a masked user ID for a numeric user ID', () => {
    const masked = maskUserId(456);
    expect(masked).toMatch(/^user_[a-f0-9]{12}$/);
  });

  it('should produce different hashes for different user IDs', () => {
    expect(maskUserId('userA')).not.toEqual(maskUserId('userB'));
  });

  it('should not expose the raw user ID in the hash', () => {
    const userId = 'secretUser';
    const masked = maskUserId(userId);
    expect(masked).not.toContain(userId);
  });
});

describe('UserIdMasker.maskObject', () => {
  it('should mask userId, email, and token fields', () => {
    const obj = {
      userId: 'user123',
      email: 'john.doe@example.com',
      token: 'abc123456789xyz',
      message: 'Hello john.doe@example.com, your token is abc123456789xyz',
    };
    const masked = UserIdMasker.maskObject(obj);
    expect(masked.userId).toMatch(/^user_[a-f0-9]{12}$/);
    expect(masked.email).toMatch(/^jo\*\*\*@example.com$/);
    expect(masked.token).toMatch(/^abc\*\*\*xyz$/);
    expect(masked.message).not.toContain('john.doe@example.com');
    expect(masked.message).not.toContain('abc123456789xyz');
    expect(masked.message).toContain('jo***@example.com');
    expect(masked.message).toContain('abc***xyz');
  });

  it('should mask template variables in strings', () => {
    const obj = {
      template: 'Hello {{ username }}, your code is {{ code }}',
    };
    const masked = UserIdMasker.maskObject(obj);
    expect(masked.template).toBe('Hello {{***}}, your code is {{***}}');
  });

  it('should mask nested objects and arrays', () => {
    const obj = {
      userId: 'user123',
      nested: {
        email: 'jane.doe@example.com',
        tokens: ['abc123456789xyz', 'def987654321uvw'],
      },
    };
    const masked = UserIdMasker.maskObject(obj);
    expect(masked.userId).toMatch(/^user_[a-f0-9]{12}$/);
    expect(masked.nested.email).toMatch(/^ja\*\*\*@example.com$/);
    expect(masked.nested.tokens[0]).toMatch(/^abc\*\*\*xyz$/);
    expect(masked.nested.tokens[1]).toMatch(/^def\*\*\*uvw$/);
  });

  it('should handle missing fields gracefully', () => {
    const obj = { foo: 'bar' };
    const masked = UserIdMasker.maskObject(obj);
    expect(masked.foo).toBe('bar');
  });

  it('should not modify non-object or null input', () => {
    expect(UserIdMasker.maskObject(null)).toBe(null);
    expect(UserIdMasker.maskObject(undefined)).toBe(undefined);
    expect(UserIdMasker.maskObject('string')).toBe('string');
  });
});
