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

const API_URL = getApiBaseUrl();

/**
 * Axios instance for API calls
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
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
   * Register new user
   * @param data - Registration data (email, password, username)
   * @returns Registered user data
   */
  async register(data: RegisterData): Promise<RegisterResponse> {
    try {
      const response = await apiClient.post<RegisterResponse>('/users/register', data);
      return response.data;
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
          logError(appError, 'authApi.getCurrentUser', { status: response.status });
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
        logError(appError, 'authApi.getCurrentUser', { status, url: '/api/auth/session' });
        throw appError;
      }
      const data = await response.json();
      return data.user;
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : toAppError(error, 'Failed to get user data');
      logError(appError, 'authApi.getCurrentUser');
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

export default apiClient;
