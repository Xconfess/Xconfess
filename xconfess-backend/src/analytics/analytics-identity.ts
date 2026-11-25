import { createHmac } from 'crypto';

/**
 * Analytics identity redaction (Issue #2281).
 *
 * Generated identity identifiers (anonymous user IDs, registered user IDs)
 * must never be written to analytics storage or forwarded to analytics
 * consumers in raw form. Every `actorId` is replaced with a keyed,
 * one-way pseudonym before persistence:
 *
 *   anon:<anonymousUserId>  ->  anon:p1_<32 hex chars>
 *   user:<userId>           ->  user:p1_<32 hex chars>
 *   <anything else>         ->  actor:p1_<32 hex chars>
 *
 * The pseudonym is stable for a given key, so distinct-actor aggregates
 * (DAU/WAU/MAU, retention cohorts) keep working, but it cannot be reversed
 * or joined back to identity tables without the server-side secret.
 *
 * If no key material is configured the actor is dropped (fail safe):
 * analytics still records the event, only without an actor.
 */

export const ACTOR_PSEUDONYM_VERSION = 'p1';

const KEY_DERIVATION_LABEL = 'xconfess:analytics-actor-pseudonym:v1';
const PSEUDONYM_PATTERN = /^(anon|user|actor):p1_[0-9a-f]{32}$/;
const PREFIXED_ACTOR_PATTERN = /^(anon|user):(.+)$/;

export type ConfigLookup = (key: string) => string | undefined | null;

/**
 * Derive the HMAC key used for actor pseudonyms.
 *
 * Prefers the dedicated `ANALYTICS_ACTOR_PSEUDONYM_SECRET`; falls back to a
 * key derived from `JWT_SECRET` so existing deployments are protected without
 * new configuration. The derived key is domain-separated, so the JWT signing
 * secret itself is never used directly as the HMAC key.
 */
export function resolveActorPseudonymKey(get: ConfigLookup): Buffer | null {
  const source =
    get('ANALYTICS_ACTOR_PSEUDONYM_SECRET')?.trim() || get('JWT_SECRET')?.trim();
  if (!source) {
    return null;
  }
  return createHmac('sha256', source).update(KEY_DERIVATION_LABEL).digest();
}

export function isPseudonymousActorId(value: unknown): boolean {
  return typeof value === 'string' && PSEUDONYM_PATTERN.test(value);
}

/**
 * Convert a raw actor identifier into its analytics pseudonym.
 * Returns `null` for empty input or when no key is available.
 */
export function pseudonymizeActorId(
  raw: string | number | null | undefined,
  key: Buffer | null,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const value = String(raw).trim();
  if (!value) {
    return null;
  }
  if (isPseudonymousActorId(value)) {
    return value;
  }
  if (!key) {
    return null;
  }

  const match = PREFIXED_ACTOR_PATTERN.exec(value);
  const namespace = match ? match[1] : 'actor';
  const subject = match ? match[2] : value;
  const digest = createHmac('sha256', key)
    .update(`${namespace}\u0000${subject}`)
    .digest('hex')
    .slice(0, 32);

  return `${namespace}:${ACTOR_PSEUDONYM_VERSION}_${digest}`;
}

/**
 * Metadata / payload keys that carry identity identifiers. Their presence in
 * an analytics payload is rejected outright; actors must go through `actorId`
 * so they are pseudonymised.
 */
export const IDENTITY_IDENTIFIER_KEYS = [
  'anonymous_user_id',
  'anonymous_context_id',
  'anon_id',
  'user_id',
  'sender_id',
  'recipient_id',
  'author_id',
  'device_id',
  'session_id',
  'wallet_address',
  'stellar_address',
  'public_key',
] as const;
