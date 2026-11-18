import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import {
  DEPRECATED_API_META,
  DeprecatedApiOptions,
} from '../decorators/deprecated-api.decorator';

/**
 * Emits standardized deprecation headers for routes marked with
 * `@DeprecatedApi(...)`:
 *
 * - `Deprecation: @<unix-seconds>` (RFC 9745)
 * - `Sunset: <HTTP-date>` (RFC 8594)
 * - `Link: <successor>; rel="successor-version"[; title="<guidance>"]` (RFC 8288)
 *
 * The headers are added before the handler runs, so they are present on error
 * responses too. Routes that opt into `legacyQueryParam` only emit them when
 * the client actually used the legacy parameter.
 */
@Injectable()
export class DeprecationHeadersInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Global interceptors also run for WebSocket handlers, which have no
    // HTTP response object and therefore no headers to set.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const options = this.reflector.getAllAndOverride<DeprecatedApiOptions>(
      DEPRECATED_API_META,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    if (this.shouldApply(options, request)) {
      this.applyHeaders(response, options);
    }

    return next.handle();
  }

  private shouldApply(
    options: DeprecatedApiOptions,
    request: { query?: Record<string, unknown> } | undefined,
  ): boolean {
    if (!options.legacyQueryParam) {
      return true;
    }

    const value = request?.query?.[options.legacyQueryParam];
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  private applyHeaders(
    response: { setHeader?: (name: string, value: string) => unknown } | undefined,
    options: DeprecatedApiOptions,
  ): void {
    if (!response || typeof response.setHeader !== 'function') {
      return;
    }

    const deprecatedAtMs = Date.parse(options.deprecatedAt);
    if (Number.isFinite(deprecatedAtMs)) {
      // RFC 9745 encodes the deprecation date as a structured Unix timestamp.
      response.setHeader('Deprecation', `@${Math.floor(deprecatedAtMs / 1000)}`);
    }

    const sunsetAt = new Date(options.sunsetAt);
    if (!Number.isNaN(sunsetAt.getTime())) {
      response.setHeader('Sunset', sunsetAt.toUTCString());
    }

    if (options.successor) {
      const title = options.guidance
        ? `; title="${options.guidance.replace(/"/g, "'")}"`
        : '';
      response.setHeader(
        'Link',
        `<${options.successor}>; rel="successor-version"${title}`,
      );
    }
  }
}
