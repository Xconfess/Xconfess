import { createApiErrorResponse } from "@/lib/apiErrorHandler";
import { buildProxyErrorResponse, internalProxyErrorResponse } from "@/app/lib/utils/proxyError";
import { getApiBaseUrl } from "@/app/lib/config";


export async function GET(
  _request: Request,
  context: { params: Promise<{ confessionId: string }> },
) {
  const BASE_API_URL = getApiBaseUrl();
  try {
    const { confessionId } = await context.params;
    if (!confessionId) {
      return new Response(
        JSON.stringify({ message: "Confession ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    // forward pagination params if provided
    const requestUrl = new URL((_request as Request).url);
    const page = requestUrl.searchParams.get("page");
    const limit = requestUrl.searchParams.get("limit");

    const qs = new URLSearchParams();
    if (page) qs.set("page", page);
    if (limit) qs.set("limit", limit);

    const url = `${BASE_API_URL}/comments/by-confession/${confessionId}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      const isDemoMode =
        process.env.NODE_ENV === "development" ||
        process.env.DEMO_MODE === "true";

      if (isDemoMode) {
        console.warn(
          "Failed to fetch comments from backend, returning demo data for testing",
        );

        const demoComments: Record<
          string,
          Array<{ id: number; content: string; parentId: number | null }>
        > = {
          "1": [
            {
              id: 1,
              content: "This resonates with me so much!",
              parentId: null,
            },
            {
              id: 2,
              content: "I feel the same way about late night coding sessions.",
              parentId: 1,
            },
            {
              id: 3,
              content: "The midnight creativity is real.",
              parentId: null,
            },
          ],
          "2": [
            { id: 4, content: "Nothing wrong with that!", parentId: null },
            { id: 5, content: "Cartoons are art.", parentId: 4 },
            {
              id: 6,
              content: "Which ones are your favorites?",
              parentId: null,
            },
            {
              id: 7,
              content: "Avatar: The Last Airbender is peak fiction.",
              parentId: 6,
            },
          ],
          "3": [
            { id: 8, content: "That's actually a nice habit.", parentId: null },
            {
              id: 9,
              content: "Plants respond to positive energy.",
              parentId: 8,
            },
          ],
        };

        const comments = (demoComments[confessionId] || []).map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: new Date(
            Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          author: "Anonymous",
          confessionId,
          parentId: c.parentId,
          replies: [],
        }));

        const hasMore = false;

        return new Response(JSON.stringify({ comments, hasMore }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Demo-Mode": "true",
          },
        });
      }

      const errBody = await response.json().catch(() => ({}));
      return createApiErrorResponse(errBody, {
          status: response.status,
          fallbackMessage: "Failed to fetch comments",
          upstreamResponse: response,
          route: "GET /api/comments/by-confession/[confessionId]"
        });
    }

    const data = await response.json();
    const list = Array.isArray(data)
      ? data
      : (data.data ?? data.comments ?? []);

    interface BackendComment {
      id: number;
      content: string;
      createdAt?: string;
      created_at?: string;
      confessionId?: string;
      confession?: { id: string };
      parentId?: number | null;
      parent_id?: number | null;
      replies?: BackendComment[];
    }

    const comments = (list as BackendComment[]).map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt ?? c.created_at,
      author: "Anonymous",
      confessionId: (c.confessionId ?? (c.confession?.id as unknown)) as
        | string
        | undefined,
      parentId: c.parentId ?? c.parent_id ?? null,
      replies: Array.isArray(c.replies)
        ? c.replies.map((r) => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt ?? r.created_at,
            author: "Anonymous",
            parentId: r.parentId ?? r.parent_id ?? null,
          }))
        : [],
    }));

    const hasMore =
      typeof data.hasMore === "boolean"
        ? data.hasMore
        : typeof data.meta?.hasMore === "boolean"
          ? data.meta.hasMore
          : limit
            ? comments.length >= Number(limit)
            : false;

    return new Response(
      JSON.stringify({
        comments,
        hasMore,
        nextCursor: data.nextCursor ?? data.meta?.nextCursor ?? null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const isDemoMode =
      process.env.NODE_ENV === "development" ||
      process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      console.warn("Backend unreachable, returning demo comments for testing");

      const { confessionId } = await context.params;

      const demoComments: Record<
        string,
        Array<{ id: number; content: string; parentId: number | null }>
      > = {
        "1": [
          { id: 1, content: "This resonates with me so much!", parentId: null },
          {
            id: 2,
            content: "I feel the same way about late night coding sessions.",
            parentId: 1,
          },
          {
            id: 3,
            content: "The midnight creativity is real.",
            parentId: null,
          },
        ],
        "2": [
          { id: 4, content: "Nothing wrong with that!", parentId: null },
          { id: 5, content: "Cartoons are art.", parentId: 4 },
          { id: 6, content: "Which ones are your favorites?", parentId: null },
          {
            id: 7,
            content: "Avatar: The Last Airbender is peak fiction.",
            parentId: 6,
          },
        ],
        "3": [
          { id: 8, content: "That's actually a nice habit.", parentId: null },
          { id: 9, content: "Plants respond to positive energy.", parentId: 8 },
        ],
      };

      const comments = (demoComments[confessionId] || []).map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: new Date(
          Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        author: "Anonymous",
        confessionId,
        parentId: c.parentId,
        replies: [],
      }));

      const hasMore = false;

      return new Response(JSON.stringify({ comments, hasMore }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Demo-Mode": "true",
        },
      });
    }

    return internalProxyErrorResponse({ route: "GET /api/comments/by-confession/[confessionId]" }, error);
  }
}