import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),

  /**
   * Strict profile for endpoints that trigger expensive Stellar
   * Horizon/RPC calls (confession anchoring, tip verification).
   *
   * Tighter window + lower ceiling than the global default, since each
   * request here can cost real RPC quota/latency rather than just a DB hit.
   * Keyed per (IP + confession id) — see StrictThrottlerGuard.
   *
   * Expressed in seconds here for readability; converted to ms with the
   * `seconds()` helper at the ThrottlerModule registration site.
   */
  strictTtlSeconds: parseInt(process.env.THROTTLE_STRICT_TTL ?? '60', 10), // 1 minute window
  strictLimit: parseInt(process.env.THROTTLE_STRICT_LIMIT ?? '5', 10), // 5 requests per window

  /**
   * Issue #2121: abuse throttle on confession submission. A separate
   * profile from the global default so an operator can tighten the
   * window for `POST /confessions` without starving the rest of the
   * API. Keyed per IP by the default ThrottlerGuard tracker — the IP
   * never leaves the in-memory throttler store, so the key is not
   * exposed to clients or logged with the request.
   */
  confessionSubmitTtlMs: parseInt(
    process.env.CONFESSION_SUBMIT_TTL_MS ?? '60000',
    10,
  ),
  confessionSubmitLimit: parseInt(
    process.env.CONFESSION_SUBMIT_LIMIT ?? '10',
    10,
  ),
}));
