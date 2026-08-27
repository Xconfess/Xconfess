import { normalizeApiError, type ApiError } from "./errors";
import { ANONYMOUS_USER_ID_KEY } from "./constants";

const API_BASE = "";

export type ReportType =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "inappropriate_content"
  | "copyright"
  | "other";

export async function createConfessionReport(
  confessionId: string,
  dto: { type: ReportType; reason?: string },
  signal?: AbortSignal,
): Promise<
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: ApiError;
    }
> {
  if (!confessionId) {
    return {
      ok: false,
      error: { message: "Confession ID is required.", code: "VALIDATION_ERROR" },
    };
  }

  if (!dto?.type) {
    return {
      ok: false,
      error: { message: "Report type is required.", code: "VALIDATION_ERROR" },
    };
  }

  // Backend supports anonymous reports by requiring this header.
  const anonymousUserId =
    typeof window !== "undefined"
      ? localStorage.getItem(ANONYMOUS_USER_ID_KEY)
      : null;

  if (!anonymousUserId) {
    return {
      ok: false,
      error: { message: "Please log in again (anonymous user missing).", code: "AUTH_ERROR" },
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/confessions/${confessionId}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-anonymous-user-id": anonymousUserId,
      },
      body: JSON.stringify({
        type: dto.type,
        reason: dto.reason,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const data = await response.json().catch(() => null);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled.", code: "ABORTED" } };
    }

    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err)),
    );
    return { ok: false, error };
  }
}

