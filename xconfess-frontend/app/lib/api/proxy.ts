import 'server-only';

import { getApiBaseUrl } from '@/app/lib/config';
import { getOrCreateRequestId } from '@/app/lib/utils/requestId';

export interface ProxyRequestOptions extends RequestInit {
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000;

export interface BackendRoute {
  url: string;
  requestId: string;
}

export function resolveBackendRoute(
  request: Request,
  endpoint: string,
): BackendRoute {
  const requestId = getOrCreateRequestId(request);
  const baseApiUrl = getApiBaseUrl();
  const requestUrl = new URL(request.url);
  const backendApiUrl = new URL(baseApiUrl);

  if (backendApiUrl.host === requestUrl.host) {
    throw Object.assign(
      new Error(
        'Server misconfiguration: BACKEND_API_URL points to the frontend instead of the Render backend.',
      ),
      { code: 'BACKEND_API_URL_SELF_REFERENCE', status: 503, requestId },
    );
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return {
    url: `${baseApiUrl}${normalizedEndpoint}`,
    requestId,
  };
}

export function methodNotAllowed(method: string, allowed: string[]): Response {
  return Response.json(
    {
      code: 'METHOD_NOT_ALLOWED',
      message: `Method ${method} is not allowed. Use ${allowed.join(', ')}.`,
    },
    {
      status: 405,
      headers: {
        Allow: allowed.join(', '),
      },
    },
  );
}

export async function proxyRequest<T = unknown>(
  targetUrl: string,
  options: ProxyRequestOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(targetUrl, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(errorBody.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export function createProxyHandler(baseUrl: string) {
  return async function proxy<T>(
    endpoint: string,
    options: ProxyRequestOptions = {}
  ): Promise<T> {
    const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`;
    return proxyRequest<T>(url, options);
  };
}
