import {
  normalizeConfession,
  type NormalizedConfession,
  type RawConfession,
} from "../utils/normalizeConfession";
import { normalizeApiError, type ApiError } from "./errors";

const API_BASE = "";

export interface GetConfessionsParams {
  page?: number;
  limit?: number;
  sort?: string;
  gender?: string;
  userId?: string;
}

export interface GetConfessionsResult {
  confessions: NormalizedConfession[];
  hasMore: boolean;
  total?: number;
  page?: number;
}

export type GetConfessionsResponse =
  | { ok: true; data: GetConfessionsResult }
  | { ok: false; error: ApiError };

/**
 * Fetches a paginated list of confessions from the API.
 */
export async function getConfessions(
  params: GetConfessionsParams = {},
  signal?: AbortSignal
): Promise<GetConfessionsResponse> {
  const { page = 1, limit = 10, sort = "newest", gender, userId } = params;
  const search = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
  });
  if (gender) search.set("gender", gender);
  if (userId) search.set("userId", userId);

  try {
    const response = await fetch(`${API_BASE}/api/confessions?${search}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    });

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const json = await response.json();
    const rawList = json.data ?? json.confessions ?? [];
    const confessions = Array.isArray(rawList)
      ? (rawList as RawConfession[]).map(normalizeConfession)
      : [];

    return {
      ok: true,
      data: {
        confessions,
        hasMore: json.hasMore === true,
        total: json.total,
        page: json.page ?? page,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }
    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err))
    );
    return { ok: false, error };
  }
}

export interface GetConfessionByIdResult {
  id: string;
  content: string;
  createdAt: string;
  viewCount: number;
  reactions: { like: number; love: number };
  commentCount?: number;
  isAnchored?: boolean;
  stellarTxHash?: string | null;
  anchorStatus?: "confirmed" | "pending" | "not_anchored";
  author?: { id: string; username?: string; avatar?: string | null; stellarAddress?: string };
}

export type GetConfessionByIdResponse =
  | { ok: true; data: GetConfessionByIdResult }
  | { ok: false; error: ApiError };

/**
 * Fetches a single confession by ID.
 */
export async function getConfessionById(
  id: string,
  signal?: AbortSignal
): Promise<GetConfessionByIdResponse> {
  if (!id) {
    return {
      ok: false,
      error: { message: "Confession ID is required.", code: "VALIDATION_ERROR" },
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/confessions/${id}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    });

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const data = await response.json();
    const normalized = normalizeConfession(data as RawConfession);
    const reactions = normalized.reactions ?? {};
    const result: GetConfessionByIdResult = {
      id: normalized.id,
      content: normalized.content,
      createdAt: normalized.createdAt,
      viewCount: normalized.viewCount,
      reactions: {
        like: typeof reactions.like === "number" ? reactions.like : 0,
        love: typeof reactions.love === "number" ? reactions.love : 0,
      },
      commentCount: normalized.commentCount,
      author: normalized.author,
    };
    if ("isAnchored" in data) result.isAnchored = data.isAnchored;
    if ("stellarTxHash" in data) result.stellarTxHash = data.stellarTxHash ?? null;
    result.anchorStatus =
      (data.anchorStatus as GetConfessionByIdResult["anchorStatus"]) ??
      (result.isAnchored
        ? "confirmed"
        : result.stellarTxHash
          ? "pending"
          : "not_anchored");

    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }
    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err))
    );
    return { ok: false, error };
  }
}

export interface CreateConfessionParams {
  message?: string;
  body?: string;
  title?: string;
  gender?: string | null;
  stellarTxHash?: string | null;
}

export type CreateConfessionResponse =
  | { ok: true; data: NormalizedConfession }
  | { ok: false; error: ApiError };

/**
 * Creates a new confession.
 */
export async function createConfession(
  params: CreateConfessionParams,
  signal?: AbortSignal
): Promise<CreateConfessionResponse> {
  const content = params.body ?? params.message ?? "";
  if (!content.trim()) {
    return {
      ok: false,
      error: { message: "Confession content is required.", code: "VALIDATION_ERROR" },
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/confessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        body: content,
        title: params.title,
        gender: params.gender,
        stellarTxHash: params.stellarTxHash,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const data = await response.json();
    const normalized = normalizeConfession(data as RawConfession);
    return { ok: true, data: normalized };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }
    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err))
    );
    return { ok: false, error };
  }
}
