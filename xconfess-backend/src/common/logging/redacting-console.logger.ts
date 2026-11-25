import { ConsoleLogger } from '@nestjs/common';
import { redactLogMessage } from './log-redaction';

/**
 * Application-wide logger (Issue #2282).
 *
 * Installed in `main.ts`, so every `new Logger(...)` call in the codebase is
 * routed through it. Messages and extra params are passed through
 * `redactLogMessage` (tokens, secrets, user-generated text) before output.
 * The trailing context string Nest appends is left untouched.
 *
 * Fails safe: if redaction throws, a fixed placeholder is logged instead of
 * the original value.
 */
export const REDACTION_FAILED = '[log redaction failed]';

export class RedactingConsoleLogger extends ConsoleLogger {
  log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(safeRedact(message), ...redactParams(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(safeRedact(message), ...redactParams(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(safeRedact(message), ...redactParams(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(safeRedact(message), ...redactParams(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(safeRedact(message), ...redactParams(optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(safeRedact(message), ...redactParams(optionalParams));
  }
}

function safeRedact(value: unknown): unknown {
  try {
    return redactLogMessage(value);
  } catch {
    return REDACTION_FAILED;
  }
}

/** Nest logger contexts are identifiers such as class names. */
const CONTEXT_PATTERN = /^[\w.:-]+$/;

/**
 * Redact every optional param except a trailing context name: Nest passes the
 * logger context last, and it is a class name, not user data. A trailing
 * stack trace (no context) does not match and is redacted.
 */
function redactParams(params: unknown[]): unknown[] {
  if (params.length === 0) {
    return params;
  }
  const lastIndex = params.length - 1;
  return params.map((param, index) =>
    index === lastIndex && typeof param === 'string' && CONTEXT_PATTERN.test(param)
      ? param
      : safeRedact(param),
  );
}
