/**
 * Contract Error Code Mapping & Classification
 *
 * Stable backend-facing error codes for Soroban contract failures.
 * These codes are consumed by off-chain services for:
 * - Distinguishing retryable from terminal failures
 * - Generating appropriate HTTP responses
 * - Implementing exponential backoff and circuit breaker logic
 *
 * ERROR REGISTRY VERSION: 1
 * If contract errors change in breaking ways, the version will be bumped.
 */

export enum ContractErrorClassification {
  /** Retryable: transient state (pause, rate limit, cooldown, overflow) */
  RETRYABLE = 'RETRYABLE',

  /** Terminal: caller's responsibility (invalid input, auth, business logic) */
  TERMINAL = 'TERMINAL',

  /** Unknown: treat as terminal, log for investigation */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Stable backend-facing error codes from confession-anchor contract
 * See: xconfess-contracts/contracts/error.rs
 */
export const ANCHOR_ERROR_CODES = {
  // Global/Common errors (1000-1099)
  UNAUTHORIZED: 1000,
  NOT_FOUND: 1001,
  INVALID_INPUT: 1002,
  OVERFLOW: 1003,
  COOLDOWN_ACTIVE: 1004,
  PAYLOAD_TOO_LARGE: 1005,
  METADATA_TOO_LONG: 1006,

  // Confession module (2000-2099)
  CONFESSION_EXISTS: 2000,
  CONFESSION_EMPTY: 2001,
  CONFESSION_TOO_LONG: 2002,

  // Reaction module (3000-3099)
  REACTION_EXISTS: 3000,
  INVALID_REACTION_TYPE: 3001,

  // Report module (4000-4099)
  REPORT_EXISTS: 4000,
  INVALID_REPORT_REASON: 4001,
  REPORT_REASON_TOO_LONG: 4002,

  // Governance module (5000-5099)
  PROPOSAL_NOT_FOUND: 5000,
  UNAUTHORIZED_APPROVAL: 5001,
  QUORUM_NOT_REACHED: 5002,
  ALREADY_APPROVED: 5003,
  ALREADY_EXECUTED: 5004,
  INVALID_ACTION: 5005,
} as const;

/**
 * Stable backend-facing error codes from anonymous-tipping contract
 * See: xconfess-contracts/contracts/anonymous-tipping/src/lib.rs
 */
export const TIPPING_ERROR_CODES = {
  // Tipping module (6000-6099)
  INVALID_TIP_AMOUNT: 6001,
  METADATA_TOO_LONG: 6002,
  TOTAL_OVERFLOW: 6003,
  NONCE_OVERFLOW: 6004,
  UNAUTHORIZED: 6005,
  CONTRACT_PAUSED: 6006,
  RATE_LIMITED: 6007,
  INVALID_RATE_LIMIT_CONFIG: 6008,
} as const;

/**
 * Unified error code registry for all contract failures
 */
export const CONTRACT_ERROR_CODES = {
  ...TIPPING_ERROR_CODES,
  TIPPING_METADATA_TOO_LONG: TIPPING_ERROR_CODES.METADATA_TOO_LONG,
  TIPPING_UNAUTHORIZED: TIPPING_ERROR_CODES.UNAUTHORIZED,
  ...ANCHOR_ERROR_CODES,
} as const;

type ErrorCodeValue =
  | (typeof ANCHOR_ERROR_CODES)[keyof typeof ANCHOR_ERROR_CODES]
  | (typeof TIPPING_ERROR_CODES)[keyof typeof TIPPING_ERROR_CODES];

/**
 * Error classification map: determines retry strategy and HTTP response code
 * Retryable errors should trigger exponential backoff, circuit breaker logic
 * Terminal errors should fail immediately with appropriate HTTP status
 */
const ERROR_CLASSIFICATIONS: Record<ErrorCodeValue, ContractErrorClassification> = {
  // Global errors
  [ANCHOR_ERROR_CODES.UNAUTHORIZED]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.NOT_FOUND]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.INVALID_INPUT]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.OVERFLOW]: ContractErrorClassification.RETRYABLE,
  [ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE]: ContractErrorClassification.RETRYABLE,
  [ANCHOR_ERROR_CODES.PAYLOAD_TOO_LARGE]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.METADATA_TOO_LONG]: ContractErrorClassification.TERMINAL,

  // Confession errors
  [ANCHOR_ERROR_CODES.CONFESSION_EXISTS]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.CONFESSION_EMPTY]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.CONFESSION_TOO_LONG]: ContractErrorClassification.TERMINAL,

  // Reaction errors
  [ANCHOR_ERROR_CODES.REACTION_EXISTS]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.INVALID_REACTION_TYPE]: ContractErrorClassification.TERMINAL,

  // Report errors
  [ANCHOR_ERROR_CODES.REPORT_EXISTS]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.INVALID_REPORT_REASON]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.REPORT_REASON_TOO_LONG]: ContractErrorClassification.TERMINAL,

  // Governance errors
  [ANCHOR_ERROR_CODES.PROPOSAL_NOT_FOUND]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.UNAUTHORIZED_APPROVAL]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.QUORUM_NOT_REACHED]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.ALREADY_APPROVED]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.ALREADY_EXECUTED]: ContractErrorClassification.TERMINAL,
  [ANCHOR_ERROR_CODES.INVALID_ACTION]: ContractErrorClassification.TERMINAL,

  // Tipping errors
  [TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT]: ContractErrorClassification.TERMINAL,
  [TIPPING_ERROR_CODES.METADATA_TOO_LONG]: ContractErrorClassification.TERMINAL,
  [TIPPING_ERROR_CODES.TOTAL_OVERFLOW]: ContractErrorClassification.RETRYABLE,
  [TIPPING_ERROR_CODES.NONCE_OVERFLOW]: ContractErrorClassification.RETRYABLE,
  [TIPPING_ERROR_CODES.UNAUTHORIZED]: ContractErrorClassification.TERMINAL,
  [TIPPING_ERROR_CODES.CONTRACT_PAUSED]: ContractErrorClassification.RETRYABLE,
  [TIPPING_ERROR_CODES.RATE_LIMITED]: ContractErrorClassification.RETRYABLE,
  [TIPPING_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG]: ContractErrorClassification.TERMINAL,
};

/**
 * Classify a contract error code for backend handling
 *
 * @param errorCode - Numeric error code from contract failure
 * @returns Classification (Retryable, Terminal, or Unknown)
 *
 * @example
 * if (classifyContractError(1004) === ContractErrorClassification.RETRYABLE) {
 *   // Use exponential backoff
 *   await retryWithBackoff(() => invokeContract(...));
 * } else {
 *   // Fail immediately
 *   throw new BadRequestException('Cooldown period not elapsed');
 * }
 */
export function classifyContractError(
  errorCode: number,
): ContractErrorClassification {
  return (
    ERROR_CLASSIFICATIONS[errorCode as ErrorCodeValue] ||
    ContractErrorClassification.UNKNOWN
  );
}

/**
 * Check if a contract error is retryable
 * Use this in retry logic, circuit breaker implementations
 */
export function isRetryableContractError(errorCode: number): boolean {
  return classifyContractError(errorCode) === ContractErrorClassification.RETRYABLE;
}

/**
 * Get human-readable error message for a contract error code
 * Maps numeric codes back to meaningful descriptions
 */
export function getContractErrorMessage(errorCode: number): string {
  const codeEntry = Object.entries(CONTRACT_ERROR_CODES).find(
    ([, code]) => code === errorCode,
  );

  if (!codeEntry) {
    return `Unknown contract error: ${errorCode}`;
  }

  const [codeName] = codeEntry;

  // Convert CONSTANT_CASE to Title Case
  const titleCase = codeName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return titleCase;
}

/**
 * Suggested HTTP status code for a contract error (for API responses)
 *
 * Retryable errors → 503 Service Unavailable (encourage client retry)
 * Terminal errors → 400 Bad Request or 409 Conflict (no retry)
 */
export function getHttpStatusForContractError(errorCode: number): number {
  const classification = classifyContractError(errorCode);

  switch (classification) {
    case ContractErrorClassification.RETRYABLE:
      return 503; // Service Unavailable — retry with backoff
    case ContractErrorClassification.TERMINAL:
    default:
      // Further classify terminal errors
      if (errorCode === ANCHOR_ERROR_CODES.UNAUTHORIZED ||
          errorCode === TIPPING_ERROR_CODES.UNAUTHORIZED) {
        return 403; // Forbidden
      }
      if (errorCode === ANCHOR_ERROR_CODES.NOT_FOUND ||
          errorCode === ANCHOR_ERROR_CODES.PROPOSAL_NOT_FOUND) {
        return 404; // Not Found
      }
      if (errorCode === ANCHOR_ERROR_CODES.CONFESSION_EXISTS ||
          errorCode === ANCHOR_ERROR_CODES.REACTION_EXISTS ||
          errorCode === ANCHOR_ERROR_CODES.REPORT_EXISTS) {
        return 409; // Conflict
      }
      return 400; // Bad Request (default for terminal)
  }
}

/**
 * Determine retry strategy based on error code
 *
 * Returns backoff delay in milliseconds, or null if error is terminal
 */
export function getRetryDelayMs(
  errorCode: number,
  attemptNumber: number = 0,
): number | null {
  if (!isRetryableContractError(errorCode)) {
    return null; // Terminal errors should not be retried
  }

  // Exponential backoff with jitter
  // Attempt 0: 100-200ms
  // Attempt 1: 200-400ms
  // Attempt 2: 400-800ms
  // etc.
  const baseDelay = 100 * Math.pow(2, attemptNumber);
  const jitter = Math.random() * baseDelay;
  return baseDelay + jitter;
}
