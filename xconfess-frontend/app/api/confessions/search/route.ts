import { getApiBaseUrl } from "@/app/lib/config";
import { buildBackendSearchParams } from "@/app/lib/search/searchParams";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const backendParams = buildBackendSearchParams(searchParams);
  const page = parseNumber(backendParams.get("page"), 1);
  const limit = parseNumber(backendParams.get("limit"), 10);

  const searchUrl = `${BASE_API_URL}/confessions/search?${backendParams}`;

  try {
    const authHeader = request.headers.get("Authorization");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const res = await fetch(searchUrl, {
      method: "GET",
      headers,
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return createApiErrorResponse(errData, {
        status: res.status,
        fallbackMessage: `Search failed: ${res.statusText}`,
        route: "GET /api/confessions/search",
      });
    }

    const data = (await res.json()) as {
      data?: unknown[];
      confessions?: unknown[];
      hasMore?: boolean;
      total?: number;
      page?: number;
      limit?: number;
      degraded?: boolean;
      partial?: boolean;
      message?: string;
      warnings?: string[];
      meta?: {
        total?: number;
        page?: number;
        limit?: number;
        searchType?: string;
        degraded?: boolean;
        partial?: boolean;
        warning?: string;
        warnings?: string[];
        message?: string;
      };
    };

    const confessions = data.data ?? data.confessions ?? [];
    const totalCount = parseNumber(data.total ?? data.meta?.total, 0);
    const currentPage = parseNumber(data.page ?? data.meta?.page, page);
    const currentLimit = parseNumber(data.limit ?? data.meta?.limit, limit);
    const hasMore =
      typeof data.hasMore === "boolean"
        ? data.hasMore
        : currentPage * currentLimit < totalCount;

    const warnings = [
      ...(Array.isArray(data.warnings) ? data.warnings : []),
      ...(Array.isArray(data.meta?.warnings) ? data.meta.warnings : []),
      ...(typeof data.meta?.warning === "string" ? [data.meta.warning] : []),
    ].filter((entry) => typeof entry === "string" && entry.trim().length > 0);

    const inferredPartialFromSearchType =
      data.meta?.searchType === "fallback" ||
      data.meta?.searchType === "ilike" ||
      data.meta?.searchType === "partial";

    const partial = parseBoolean(
      data.partial ?? data.meta?.partial ?? inferredPartialFromSearchType,
      false,
    );
    const degraded = parseBoolean(
      data.degraded ?? data.meta?.degraded,
      warnings.length > 0,
    );

    return Response.json({
      confessions,
      hasMore,
      total: totalCount,
      page: currentPage,
      partial,
      degraded,
      warnings,
      message:
        (typeof data.message === "string" && data.message) ||
        (typeof data.meta?.message === "string" && data.meta.message) ||
        undefined,
      meta: {
        total: totalCount,
        page: currentPage,
        limit: currentLimit,
        searchType: data.meta?.searchType ?? "unknown",
      },
    });
  } catch (err) {
    return createApiErrorResponse(err, {
      status: 503,
      fallbackMessage: "Search service unavailable",
      route: "GET /api/confessions/search",
    });
  }
}
