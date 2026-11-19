import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Wildcard CORS is never valid together with `credentials: true`. */
export const CORS_WILDCARD = '*';

export const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

export interface CorsSettings {
  /** Comma-separated allowlist, typically `CORS_ALLOWED_ORIGINS`. */
  corsAllowedOrigins?: string;
  /** Single-origin fallback, typically `FRONTEND_URL`. */
  frontendUrl?: string;
}

/**
 * Splits a comma-separated origin list, trims entries, drops blanks and
 * trailing slashes, and removes duplicates while preserving order.
 */
export function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) {
    return [];
  }

  const origins = new Set<string>();
  for (const entry of raw.split(',')) {
    const origin = entry.trim().replace(/\/+$/, '');
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

/**
 * Resolves the browser origin allowlist.
 *
 * `CORS_ALLOWED_ORIGINS` wins when set; otherwise the single `FRONTEND_URL`
 * default is used. A wildcard entry is rejected because credentialed requests
 * (`Access-Control-Allow-Credentials: true`) must never allow every origin —
 * any site could then read authenticated responses.
 */
export function resolveAllowedOrigins(settings: CorsSettings = {}): string[] {
  let origins = parseAllowedOrigins(settings.corsAllowedOrigins);

  if (origins.length === 0) {
    origins = parseAllowedOrigins(
      settings.frontendUrl || DEFAULT_FRONTEND_URL,
    );
  }

  if (origins.length === 0) {
    origins = [DEFAULT_FRONTEND_URL];
  }

  if (origins.includes(CORS_WILDCARD)) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must list explicit origins; "*" cannot be used because credentialed requests are enabled.',
    );
  }

  return origins;
}

/**
 * Builds the HTTP CORS options used by the Nest bootstrap.
 *
 * Unknown origins are denied by returning `false` from the origin callback.
 * The request still completes server-side, but without CORS headers the browser
 * blocks the response — so no error details (or credentials) leak to the
 * caller.
 */
export function buildCorsOptions(settings: CorsSettings = {}): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins(settings);

  return {
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, server-to-server calls,
      // same-origin navigation) are not CORS requests.
      if (!origin) {
        return callback(null, true);
      }

      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    // Browser JS may read these non-simple response headers.
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'Deprecation',
      'Sunset',
      'Link',
    ],
    maxAge: 600,
  };
}
