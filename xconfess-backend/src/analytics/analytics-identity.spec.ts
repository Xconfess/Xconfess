import {
  isPseudonymousActorId,
  pseudonymizeActorId,
  resolveActorPseudonymKey,
} from './analytics-identity';

const lookup =
  (values: Record<string, string | undefined>) => (key: string) =>
    values[key];

describe('analytics identity pseudonymisation', () => {
  const key = resolveActorPseudonymKey(lookup({ JWT_SECRET: 'j'.repeat(48) }));

  it('replaces raw anonymous and user IDs with namespaced pseudonyms', () => {
    const anon = pseudonymizeActorId('anon:3f1c9a8e-1111-4222-8333-944455556666', key);
    const user = pseudonymizeActorId('user:41', key);

    expect(anon).toMatch(/^anon:p1_[0-9a-f]{32}$/);
    expect(user).toMatch(/^user:p1_[0-9a-f]{32}$/);
    expect(anon).not.toContain('3f1c9a8e');
    expect(user).not.toContain('41');
  });

  it('is deterministic so distinct-actor aggregates still work', () => {
    expect(pseudonymizeActorId('anon:abc', key)).toBe(pseudonymizeActorId('anon:abc', key));
    expect(pseudonymizeActorId('anon:abc', key)).not.toBe(
      pseudonymizeActorId('anon:abd', key),
    );
  });

  it('separates namespaces so anon and user IDs with the same value do not collide', () => {
    const anon = pseudonymizeActorId('anon:7', key)!;
    const user = pseudonymizeActorId('user:7', key)!;
    expect(anon.split('_')[1]).not.toBe(user.split('_')[1]);
  });

  it('hashes unprefixed identifiers under the actor namespace', () => {
    expect(pseudonymizeActorId('actor-smoke', key)).toMatch(/^actor:p1_[0-9a-f]{32}$/);
    expect(pseudonymizeActorId(42, key)).toMatch(/^actor:p1_/);
  });

  it('does not re-hash values that are already pseudonyms', () => {
    const once = pseudonymizeActorId('anon:abc', key)!;
    expect(isPseudonymousActorId(once)).toBe(true);
    expect(pseudonymizeActorId(once, key)).toBe(once);
  });

  it('fails safe by dropping the actor when no key is configured', () => {
    expect(resolveActorPseudonymKey(lookup({}))).toBeNull();
    expect(pseudonymizeActorId('anon:abc', null)).toBeNull();
  });

  it('returns null for empty actors', () => {
    expect(pseudonymizeActorId(undefined, key)).toBeNull();
    expect(pseudonymizeActorId(null, key)).toBeNull();
    expect(pseudonymizeActorId('   ', key)).toBeNull();
  });

  it('prefers the dedicated secret and never uses JWT_SECRET as the raw HMAC key', () => {
    const dedicated = resolveActorPseudonymKey(
      lookup({ ANALYTICS_ACTOR_PSEUDONYM_SECRET: 'a'.repeat(32), JWT_SECRET: 'j'.repeat(48) }),
    );
    expect(dedicated).not.toEqual(key);
    expect(pseudonymizeActorId('anon:abc', dedicated)).not.toBe(
      pseudonymizeActorId('anon:abc', key),
    );
    expect(key!.toString('utf8')).not.toContain('jjjj');
  });
});
