import { normalizeApiError, type ApiError } from "./errors";

const API_BASE = "/api/confessions/drafts";

export interface ConfessionDraftRecord {
  id: string;
  content: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  scheduledFor?: string | null;
  timezone?: string | null;
  status?: "draft" | "scheduled" | "posted" | string;
}

export type DraftApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

async function requestDraftApi<T>(
  path = "",
  init: RequestInit = {},
): Promise<DraftApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      return { ok: false, error: await normalizeApiError(response) };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: await normalizeApiError(
        error instanceof Error ? error : new Error(String(error)),
      ),
    };
  }
}

export function listConfessionDrafts() {
  return requestDraftApi<ConfessionDraftRecord[]>("", {
    method: "GET",
    cache: "no-store",
  });
}

export function createConfessionDraft(params: {
  content: string;
  scheduledFor?: string;
  timezone?: string;
}) {
  return requestDraftApi<ConfessionDraftRecord>("", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function updateConfessionDraft(
  id: string,
  params: {
    content: string;
    version: number;
  },
) {
  return requestDraftApi<ConfessionDraftRecord>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export function deleteConfessionDraft(id: string) {
  return requestDraftApi<{ message: string }>(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
