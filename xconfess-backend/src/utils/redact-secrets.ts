// src/utils/redact-secrets.ts
//
// Defense-in-depth redaction for Stellar signing secrets and signed
// transaction envelopes (XDR) before they ever reach a log sink. Applied at
// the global exception filter and the shared structured logger so a secret
// can never leak regardless of which code path produced the error message.

/** Stellar secret seeds: "S" + 55 base32 (RFC4648, A-Z2-7) characters. */
const STELLAR_SECRET_SEED_REGEX = /\bS[A-Z2-7]{55}\b/g;

/** Long unbroken base64 runs — typical shape of a signed transaction XDR blob. */
const LONG_BASE64_REGEX = /\b[A-Za-z0-9+/]{150,}={0,2}\b/g;

/** Object keys that must always be fully redacted regardless of content. */
const SENSITIVE_KEY_REGEX =
  /secret|privatekey|signingkey|signedxdr|envelopexdr|serversecret/i;

const REDACTED = '[REDACTED]';

export function redactSecretStrings(input: string): string {
  if (!input) return input;
  return input
    .replace(STELLAR_SECRET_SEED_REGEX, REDACTED)
    .replace(LONG_BASE64_REGEX, REDACTED);
}

/**
 * Recursively redact sensitive keys/values from a log payload.
 * Safe to call on arbitrary structured data; primitives other than strings
 * pass through unchanged.
 */
export function redactSecretsDeep(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return redactSecretStrings(value);

  if (Array.isArray(value)) return value.map((item) => redactSecretsDeep(item, seen));

  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_REGEX.test(key) ? REDACTED : redactSecretsDeep(val, seen);
    }
    return out;
  }

  return value;
}
