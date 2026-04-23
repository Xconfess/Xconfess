import 'server-only';

export interface ProxyRequestOptions extends RequestInit {
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000;

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