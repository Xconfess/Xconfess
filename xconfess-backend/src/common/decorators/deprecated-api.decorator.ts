import { SetMetadata } from '@nestjs/common';

export const DEPRECATED_API_META = 'deprecated_api';

export interface DeprecatedApiOptions {
  /** ISO date (YYYY-MM-DD) from which the behaviour is deprecated. */
  deprecatedAt: string;
  /** ISO date (YYYY-MM-DD) after which the behaviour may be removed. */
  sunsetAt: string;
  /** Path of the supported replacement endpoint. */
  successor: string;
  /** Short migration note surfaced through the `Link` title parameter. */
  guidance?: string;
  /**
   * Only emit deprecation headers when this query parameter is present.
   * Used for routes that stay supported but have a deprecated *mode*
   * (for example legacy offset pagination through `?page=`).
   */
  legacyQueryParam?: string;
}

/**
 * Marks a legacy route (or a legacy mode of a route) as deprecated.
 *
 * `DeprecationHeadersInterceptor` turns this metadata into the standardized
 * `Deprecation`, `Sunset` and `Link` response headers so clients can detect the
 * change before the behaviour is removed.
 */
export const DeprecatedApi = (options: DeprecatedApiOptions) =>
  SetMetadata(DEPRECATED_API_META, options);
