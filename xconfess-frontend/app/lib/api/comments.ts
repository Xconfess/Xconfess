import type { Comment } from "@/app/lib/types/confession";
import { AUTH_TOKEN_KEY } from "@/app/lib/api/constants";
import { normalizeApiError, type ApiError } from "@/app/lib/api/errors";

export interface GetCommentsParams {
  page?: number;
  limit?: number;
}

export interface GetCommentsResult {
  comments: Comment[];
  hasMore: boolean;
}

export type GetCommentsResponse =
  | { ok: true; data: GetCommentsResult }
  | { ok: false; error: ApiError };

export interface CreateCommentParams {
  content: string;
  anonymousContextId?: string;
  parentId?: number | null;
}

export type CreateCommentResponse =
  | { ok: true; data: Comment }
  | { ok: false; error: ApiError };

function normalizeComment(raw: Partial<Comment> & Record<string, unknown>): Comment {
  return {
    id: Number(raw.id ?? 0),
    content: String(raw.content ?? ""),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    author: String(raw.author ?? "Anonymous"),
    confessionId:
      typeof raw.confessionId === "string" ? raw.confessionId : undefined,
    parentId:
      typeof raw.parentId === "number" || raw.parentId === null
        ? raw.parentId
        : null,
    replies: Array.isArray(raw.replies)
      ? raw.replies.map((reply) =>
          normalizeComment(reply as Partial<Comment> & Record<string, unknown>),
        )
      : [],
  };
}

export async function getComments(
  confessionId: string,
  params: GetCommentsParams = {},
  signal?: AbortSignal,
): Promise<GetCommentsResponse> {
  if (!confessionId) {
    return {
      ok: false,
      error: {
        message: "Confession ID is required.",
        code: "VALIDATION_ERROR",
      },
    };
  }

  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 10),
  });

  try {
    const response = await fetch(
      `/api/comments/by-confession/${confessionId}?${search.toString()}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal,
      },
    );

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const payload = await response.json();
    const comments = Array.isArray(payload.comments)
      ? payload.comments.map(
          (comment: Partial<Comment> & Record<string, unknown>) =>
            normalizeComment(comment),
        )
      : [];

    return {
      ok: true,
      data: {
        comments,
        hasMore: payload.hasMore === true,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }

    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err)),
    );
    return { ok: false, error };
  }
}

export async function createComment(
  confessionId: string,
  params: CreateCommentParams,
  signal?: AbortSignal,
): Promise<CreateCommentResponse> {
  const content = params.content.trim();

  if (!confessionId) {
    return {
      ok: false,
      error: {
        message: "Confession ID is required.",
        code: "VALIDATION_ERROR",
      },
    };
  }

  if (!content) {
    return {
      ok: false,
      error: {
        message: "Comment content is required.",
        code: "VALIDATION_ERROR",
      },
    };
  }

  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem(AUTH_TOKEN_KEY)
      : null;

  try {
    const response = await fetch(`/api/comments/${confessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        content,
        anonymousContextId: params.anonymousContextId ?? "",
        parentId: params.parentId ?? null,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const payload = await response.json();
    return {
      ok: true,
      data: normalizeComment(payload as Partial<Comment> & Record<string, unknown>),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }

    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err)),
    );
    return { ok: false, error };
  }
}
