import 'server-only';

import { getApiBaseUrl } from '@/app/lib/config';
import { getOrCreateRequestId } from '@/app/lib/utils/requestId';

export interface ProxyRequestOptions extends RequestInit {
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000;
const FRONTEND_HOST_ENV_KEYS = [
  'FRONTEND_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
];

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
  const frontendHosts = resolveFrontendHosts(requestUrl);

  if (frontendHosts.has(backendApiUrl.host.toLowerCase())) {
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

function resolveFrontendHosts(requestUrl: URL): Set<string> {
  const hosts = new Set<string>([requestUrl.host.toLowerCase()]);

  for (const key of FRONTEND_HOST_ENV_KEYS) {
    const host = normalizeHost(process.env[key]);
    if (host) hosts.add(host);
  }

  return hosts;
}

function normalizeHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      .host
      .toLowerCase();
  } catch {
    return null;
  }
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
