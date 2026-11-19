import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getComments } from "@/app/lib/api/comments";
import { useCommentsQuery } from "@/app/lib/hooks/useComments";

jest.mock("@/app/lib/api/comments", () => ({
  createComment: jest.fn(),
  getComments: jest.fn(),
}));

const mockGetComments = getComments as jest.MockedFunction<typeof getComments>;

function buildComment(id: number) {
  return {
    id,
    content: `Comment ${id}`,
    createdAt: "2026-04-23T00:00:00.000Z",
    author: "Anonymous",
    confessionId: "confession-1",
    parentId: null,
    replies: [],
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCommentsQuery cursor pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests each page with the previous cursor and keeps server order", async () => {
    mockGetComments
      .mockResolvedValueOnce({
        ok: true,
        data: {
          comments: [buildComment(3), buildComment(2)],
          hasMore: true,
          nextCursor: "cursor-2",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          comments: [buildComment(1)],
          hasMore: false,
          nextCursor: null,
        },
      });

    const { result } = renderHook(
      () => useCommentsQuery("confession-1", 2),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.comments.map((comment) => comment.id)).toEqual([3, 2]);
    });
    expect(mockGetComments).toHaveBeenNthCalledWith(1, "confession-1", {
      cursor: undefined,
      limit: 2,
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(mockGetComments).toHaveBeenNthCalledWith(2, "confession-1", {
      cursor: "cursor-2",
      limit: 2,
    });
    expect(result.current.comments.map((comment) => comment.id)).toEqual([3, 2, 1]);
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps loaded comments and retries only the failed page", async () => {
    mockGetComments
      .mockResolvedValueOnce({
        ok: true,
        data: {
          comments: [buildComment(2)],
          hasMore: true,
          nextCursor: "cursor-1",
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { message: "Server error", code: "API_ERROR" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          comments: [buildComment(1)],
          hasMore: false,
          nextCursor: null,
        },
      });

    const { result } = renderHook(
      () => useCommentsQuery("confession-1", 1),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.comments.map((comment) => comment.id)).toEqual([2]);
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.isFetchNextPageError).toBe(true);
    expect(result.current.comments.map((comment) => comment.id)).toEqual([2]);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(mockGetComments).toHaveBeenLastCalledWith("confession-1", {
      cursor: "cursor-1",
      limit: 1,
    });
    expect(result.current.isFetchNextPageError).toBe(false);
    expect(result.current.comments.map((comment) => comment.id)).toEqual([2, 1]);
  });

  it("does not request another page when the server reports no cursor", async () => {
    mockGetComments.mockResolvedValueOnce({
      ok: true,
      data: {
        comments: [buildComment(1)],
        hasMore: true,
        nextCursor: null,
      },
    });

    const { result } = renderHook(
      () => useCommentsQuery("confession-1", 1),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.comments.map((comment) => comment.id)).toEqual([1]);
    });
    expect(result.current.hasNextPage).toBe(false);
    expect(mockGetComments).toHaveBeenCalledTimes(1);
  });
});
