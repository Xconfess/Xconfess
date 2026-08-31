// Define and export the data structure
export interface TemplateRollout {
  key: string;
  activeVersion: string;
  canaryVersion?: string;
  canaryPercentage: number;
  status: "healthy" | "unstable" | "failed";
  lastValidationFailure?: string;
}

import { getApiBaseUrl } from "@/app/lib/config";

import { getCsrfToken, CSRF_HEADER } from "@/app/lib/api/csrf";

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;

  // Attach CSRF token if available
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (csrfToken) {
    headers[CSRF_HEADER] = csrfToken;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `API Error: ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const rolloutApi = {
  getTemplates: () => fetchApi<TemplateRollout[]>("/admin/templates"),
  updateCanary: (key: string, percentage: number) =>
    fetchApi(`/admin/templates/${key}/canary`, {
      method: "PATCH",
      body: JSON.stringify({ percentage }),
    }),
  promote: (key: string) =>
    fetchApi(`/admin/templates/${key}/promote`, { method: "POST" }),
  rollback: (key: string) =>
    fetchApi(`/admin/templates/${key}/rollback`, { method: "POST" }),
  killSwitch: (key: string) =>
    fetchApi(`/admin/templates/${key}/kill`, { method: "POST" }),
};
