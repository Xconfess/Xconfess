import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    AppError,
    getStatusMessage,
    getStatusCodeString,
    logError,
    LOGIN_ATTEMPT_FAILED_MESSAGE,
    toAppError
} from '@/app/lib/utils/errorHandler';
import {
    LoginCredentials,
    LoginResponse,
    RegisterData,
    RegisterResponse,
    User,
} from '../types/auth';
import {
    NormalizedAuthError,
    getAuthErrorMessage,
} from '@/lib/normalizeAuthError';
import { getApiBaseUrl } from '@/app/lib/config';

export type AuthFieldError = 'email' | 'username' | 'password' | 'confirmPassword';

/**
 * Axios instance for proxy API calls.
 * baseURL is set to the Next.js origin so that all paths are relative to /api/*.
 * The proxy routes (app/api/**) handle forwarding requests to the backend.
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: typeof window === 'undefined' ? getApiBaseUrl() : '',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add JWT token to headers if available (for backend calls)
 * Note: In session mode, cookies are handled by the browser, but we might still
 * need to proxy tokens if the backend requires explicitly.
 * However, the new strategy is to let the /api proxy handle this.
 */
apiClient.interceptors.request.use(
  (config) => {
    // We no longer read from localStorage.
    // If we're calling the backend directly from the client, we rely on cookies being sent
    // or we'll need a different mechanism. For now, we prefer proxying through /api.
    config.withCredentials = true;
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor to handle 401 errors (token expiration)
 * Note: 401 redirects are now handled deterministically by AuthGuard
 * to prevent flicker and ensure consistent recovery paths
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Session expired or invalid - clear session cookie
      // AuthGuard will handle the deterministic redirect
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => { });
    }
    return Promise.reject(error);
  }
);

/**
 * Pull the correlation / request id out of a proxy error response so failed
 * auth attempts can surface it to the user for log tracing (issue #1729).
 * Prefers the `x-request-id` response header, then common body fields.
 */
export function extractResponseRequestId(
  response: Pick<Response, 'headers'>,
  body?: unknown,
): string | undefined {
  // Header names are case-insensitive per the Fetch spec.
  const headerId =
    response.headers.get('x-request-id') ||
    response.headers.get('x-correlation-id');
  if (headerId && headerId.trim().length > 0) {
    return headerId.trim();
  }

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const bodyId =
      record.requestId ?? record.request_id ?? record.correlationId;
    if (typeof bodyId === 'string' && bodyId.trim().length > 0) {
      return bodyId.trim();
    }
  }

  return undefined;
}

/**
 * Authentication API service
 */
export const authApi = {
  /**
   * Login user and establish session
   * @param credentials - Email and password
   * @returns Login response with user data
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        
        // Check if response is a normalized auth error from the proxy route
        if (isNormalizedAuthError(body)) {
          const normalized = body as NormalizedAuthError;
          const message = getAuthErrorMessage(normalized);
          const appError = new AppError(message, normalized.code, response.status, {
            responseBody: body,
            path: '/api/auth/session',
            normalized,
            requestId: extractResponseRequestId(response, body),
          });
          logError(appError, 'authApi.login', { status: response.status });
          throw appError;
        }

        // Fallback to old error parsing if not normalized
        const status = response.status;
        const rawApi =
          (body && ((body as any).message || (body as any).error)) || null;
        const message =
          status === 401
            ? LOGIN_ATTEMPT_FAILED_MESSAGE
            : typeof rawApi === 'string' && rawApi.trim().length > 0
              ? rawApi
              : getStatusMessage(status);
        const code = getStatusCodeString(status);
        const apiError = new AppError(message, code, status, {
          responseBody: body,
          path: '/api/auth/session',
          upstreamMessage:
            typeof rawApi === 'string' ? rawApi : undefined,
          requestId: extractResponseRequestId(response, body),
        });
        logError(apiError, 'authApi.login', { status, url: '/api/auth/session' });
        throw apiError;
      }

      return await response.json();
    } catch (error) {
      const appError =
        error instanceof AppError ? error : toAppError(error, 'Login failed');
      logError(appError, 'authApi.login');
      throw appError;
    }
  },

  /**
   * Register new user via the /api/users/register proxy route
   * @param data - Registration data (email, password, username)
   * @returns Registered user data
   */
  async register(data: RegisterData): Promise<RegisterResponse> {
    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          (body as any)?.message ?? `Registration failed (${response.status})`;
        const field = extractAuthFieldError(body);
        throw new AppError(message, (body as any)?.code ?? 'REGISTER_FAILED', response.status, {
          responseBody: body,
          path: '/api/users/register',
          field,
          requestId: extractResponseRequestId(response, body),
        });
      }

      return response.json() as Promise<RegisterResponse>;
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : toAppError(error, 'Registration failed');
      logError(appError, 'authApi.register');
      throw appError;
    }
  },

  /**
   * Get current authenticated user from session
   * @returns Current user data
   */
  async getCurrentUser(): Promise<User> {
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        
        // Check if response is a normalized auth error from the proxy route
        if (isNormalizedAuthError(body)) {
          const normalized = body as NormalizedAuthError;
          const message = getAuthErrorMessage(normalized);
          const appError = new AppError(message, normalized.code, response.status, {
            responseBody: body,
            path: '/api/auth/session',
            normalized,
          });
          if (!isExpectedMissingSession(appError)) {
            logError(appError, 'authApi.getCurrentUser', { status: response.status });
          }
          throw appError;
        }

        // Fallback to old error parsing
        const status = response.status;
        const message = getStatusMessage(status);
        const code = getStatusCodeString(status);
        const appError = new AppError(message, code, status, {
          path: '/api/auth/session',
          action: 'getCurrentUser',
        });
        if (!(status === 401 && code === 'UNAUTHORIZED')) {
          logError(appError, 'authApi.getCurrentUser', { status, url: '/api/auth/session' });
        }
        throw appError;
      }
      const data = await response.json();
      return data.user;
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : toAppError(error, 'Failed to get user data');
      if (!(appError instanceof AppError && isExpectedMissingSession(appError))) {
        logError(appError, 'authApi.getCurrentUser');
      }
      throw appError;
    }
  },

  /**
   * Logout user (clears session cookie)
   */
  async logout(): Promise<void> {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => { });
  },
};

/**
 * Check if an error response is a normalized auth error shape.
 * Used to detect responses from the new proxy route implementation.
 */
function isNormalizedAuthError(body: any): body is NormalizedAuthError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'type' in body &&
    'code' in body &&
    'message' in body &&
    'retryable' in body &&
    (body.type === 'TRANSIENT' || body.type === 'TERMINAL')
  );
}

export function getAuthFieldError(error: unknown): AuthFieldError | undefined {
  if (!(error instanceof AppError)) return undefined;
  return extractAuthFieldError(error.details?.responseBody) ?? extractAuthFieldError(error.details);
}

function extractAuthFieldError(body: unknown): AuthFieldError | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const details = 'details' in body ? (body as { details?: unknown }).details : body;
  if (!details || typeof details !== 'object') return undefined;

  const field = (details as { field?: unknown }).field;
  return isAuthFieldError(field) ? field : undefined;
}

function isAuthFieldError(field: unknown): field is AuthFieldError {
  return (
    field === 'email' ||
    field === 'username' ||
    field === 'password' ||
    field === 'confirmPassword'
  );
}

function isExpectedMissingSession(error: AppError): boolean {
  const normalized = (error.details as any)?.normalized as
    | NormalizedAuthError
    | undefined;

  return (
    error.statusCode === 401 &&
    error.code === 'INVALID_SESSION' &&
    normalized?.type === 'TERMINAL'
  );
}

export default apiClient;
