import { redactSecretStrings, redactSecretsDeep } from './redact-secrets';

describe('redactSecretStrings', () => {
  it('redacts a Stellar secret seed', () => {
    const secret = 'S' + 'A'.repeat(55);
    const input = `Failed to sign transaction with secret ${secret}`;

    expect(redactSecretStrings(input)).not.toContain(secret);
    expect(redactSecretStrings(input)).toContain('[REDACTED]');
  });

  it('redacts a long signed-XDR-shaped base64 blob', () => {
    const xdrLike = 'AAAAAgAAAAC'.repeat(20);
    const input = `Submission failed for envelope ${xdrLike}`;

    expect(redactSecretStrings(input)).not.toContain(xdrLike);
  });

  it('leaves short, unrelated strings untouched', () => {
    const input = 'Transaction submitted: abc123hash';
    expect(redactSecretStrings(input)).toBe(input);
  });

  it('handles empty/falsy input without throwing', () => {
    expect(redactSecretStrings('')).toBe('');
  });
});

describe('redactSecretsDeep', () => {
  it('redacts by key name regardless of value shape', () => {
    const value = { serverSecret: 'anything-at-all', ok: true };
    const result: any = redactSecretsDeep(value);

    expect(result.serverSecret).toBe('[REDACTED]');
    expect(result.ok).toBe(true);
  });

  it('redacts secret-shaped strings nested inside arrays and objects', () => {
    const secret = 'S' + 'Z'.repeat(55);
    const value = { logs: [{ message: `error: ${secret}` }] };
    const result: any = redactSecretsDeep(value);

    expect(result.logs[0].message).not.toContain(secret);
  });

  it('passes through non-string, non-object primitives unchanged', () => {
    expect(redactSecretsDeep(42)).toBe(42);
    expect(redactSecretsDeep(true)).toBe(true);
    expect(redactSecretsDeep(null)).toBe(null);
  });

  it('does not throw on circular references', () => {
    const value: any = { a: 1 };
    value.self = value;

    expect(() => redactSecretsDeep(value)).not.toThrow();
  });
});
