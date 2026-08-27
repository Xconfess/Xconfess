import { AnonymousUser } from './entities/anonymous-user.entity';

describe('AnonymousUser privacy', () => {
  it('should not have any userId or PII fields', () => {
    const anon = new AnonymousUser();
    expect(anon).not.toHaveProperty('userId');
    expect(anon).not.toHaveProperty('user');
    expect(Object.keys(anon)).toEqual(
      expect.arrayContaining(['id', 'createdAt']),
    );
  });
});
