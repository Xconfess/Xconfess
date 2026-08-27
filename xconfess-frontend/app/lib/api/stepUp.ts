import apiClient from './client';

/**
 * Header carrying a step-up proof on destructive admin requests. Must match the
 * backend `StepUpGuard` (`x-step-up-token`).
 */
export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';

/**
 * Error codes the backend returns when a destructive admin action lacks a
 * valid, recent step-up proof. The UI reacts to these by prompting the admin to
 * re-authenticate rather than surfacing a generic error.
 */
export const StepUpErrorCode = {
  REQUIRED: 'AUTH_STEP_UP_REQUIRED',
  EXPIRED: 'AUTH_STEP_UP_EXPIRED',
  INVALID: 'AUTH_STEP_UP_INVALID',
} as const;

export type StepUpErrorCode =
  (typeof StepUpErrorCode)[keyof typeof StepUpErrorCode];

const STEP_UP_ERROR_CODES: ReadonlySet<string> = new Set(
  Object.values(StepUpErrorCode),
);

export interface StepUpCredential {
  /** Current account password. Provide this OR `totpToken`. */
  password?: string;
  /** Current TOTP code. Provide this OR `password`. */
  totpToken?: string;
}

export interface StepUpProof {
  stepUpToken: string;
  /** Lifetime of the proof in seconds. */
  expiresIn: number;
}

/**
 * Extract the backend error `code` from an unknown thrown value (typically an
 * Axios error), if present.
 */
export function getErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

/**
 * True when the error indicates a destructive action was refused for lack of a
 * fresh step-up proof — i.e. the UI should prompt the admin to re-authenticate.
 */
export function isStepUpError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code !== undefined && STEP_UP_ERROR_CODES.has(code);
}

/**
 * Build the request header object for a step-up proof, suitable for spreading
 * into an Axios request config's `headers`.
 */
export function stepUpHeader(
  stepUpToken?: string,
): Record<string, string> | undefined {
  return stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : undefined;
}

/**
 * Re-authenticate with a password or TOTP code and obtain a short-lived step-up
 * proof to attach to subsequent destructive admin actions.
 */
export async function requestStepUp(
  credential: StepUpCredential,
): Promise<StepUpProof> {
  const response = await apiClient.post('/api/auth/step-up', credential);
  return response.data as StepUpProof;
}

export const stepUpApi = {
  requestStepUp,
  isStepUpError,
  getErrorCode,
  stepUpHeader,
};
