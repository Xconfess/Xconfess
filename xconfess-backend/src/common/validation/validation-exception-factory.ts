import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Issue #2125: produce a structured BadRequestException body from the
 * class-validator `ValidationError[]` emitted by NestJS `ValidationPipe`.
 *
 * The resulting body is routed through `HttpExceptionFilter` and emerges
 * as the documented schema v1 error envelope (see
 * `docs/API_INTEGRATION.md` §"Error schema v1"):
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "status": 400,
 *   "statusCode": 400,
 *   "code": "BAD_REQUEST",
 *   "message": "Request validation failed",
 *   "details": { "fields": { "field.path": ["reason", ...] } },
 *   "timestamp": "...",
 *   "path": "...",
 *   "requestId": "..."
 * }
 * ```
 *
 * `details.fields` reports only field paths and the human-readable
 * constraint messages that class-validator already surfaces. The
 * caller-supplied value is intentionally never echoed back — a request
 * body can carry secrets, and every bounced value would expand the
 * surface area for a leak.
 */
export function buildValidationExceptionBody(errors: ValidationError[]): {
  code: 'BAD_REQUEST';
  message: string[];
  details: { fields: Record<string, string[]> };
} {
  const fields: Record<string, string[]> = {};

  const walk = (errs: ValidationError[], prefix = ''): void => {
    for (const err of errs) {
      const path = prefix ? `${prefix}.${err.property}` : err.property;
      if (err.constraints) {
        const messages = Object.values(err.constraints).filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
        if (messages.length > 0) {
          if (fields[path]) {
            fields[path].push(...messages);
          } else {
            fields[path] = messages;
          }
        }
      }
      if (err.children && err.children.length > 0) {
        walk(err.children, path);
      }
    }
  };

  walk(errors);

  // Flat message array mirrors the shape documented in
  // docs/API_INTEGRATION.md §"Error schema v1" (message may be a list of
  // validation messages). `details.fields` is the per-property form for
  // callers that want structured display; both share the same strings.
  const message = Object.values(fields).flat();

  return {
    code: 'BAD_REQUEST',
    message,
    details: { fields },
  };
}

/**
 * Convenience factory to plug directly into `new ValidationPipe({ exceptionFactory })`.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException(buildValidationExceptionBody(errors));
}
