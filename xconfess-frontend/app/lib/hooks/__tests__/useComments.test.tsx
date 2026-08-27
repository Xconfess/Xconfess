import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import type { GetConfessionsResult } from "@/app/lib/api/confessions";
import type { GetCommentsResult } from "@/app/lib/api/comments";
import { createComment } from "@/app/lib/api/comments";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { useCreateCommentMutation } from "@/app/lib/hooks/useComments";

jest.mock("@/app/lib/api/comments", () => ({
  createComment: jest.fn(),
  getComments: jest.fn(),
}));

const mockCreateComment = createComment as jest.MockedFunction<typeof createComment>;

function buildConfession(commentCount = 2) {
  return {
    id: "confession-1",
    content: "Test confession",
    createdAt: "2026-04-23T00:00:00.000Z",
    viewCount: 1,
    commentCount,
    reactions: { like: 1, love: 0 },
    author: {
      id: "anonymous",
      username: "Anonymous",
    },
  };
}

function buildCommentsData(): InfiniteData<GetCommentsResult> {
  return {
    pageParams: [1],
    pages: [
      {
        comments: [
          {
            id: 1,
            content: "Existing comment",
            createdAt: "2026-04-23T00:00:00.000Z",
            author: "Anonymous",
            confessionId: "confession-1",
            parentId: null,
            replies: [],
          },
        ],
        hasMore: false,
      },
    ],
  };
}

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}

function seedCache(queryClient: QueryClient) {
  const commentsKey = queryKeys.comments.byConfession("confession-1");
  const listKey = queryKeys.confessions.list({});
  const detailKey = queryKeys.confessions.detail("confession-1");

  queryClient.setQueryData<InfiniteData<GetCommentsResult>>(
    commentsKey,
    buildCommentsData(),
  );
  queryClient.setQueryData<InfiniteData<GetConfessionsResult>>(listKey, {
    pageParams: [1],
    pages: [
      {
        confessions: [buildConfession()],
        hasMore: false,
        page: 1,
      },
    ],
  });
  queryClient.setQueryData(detailKey, buildConfession());

  return { commentsKey, listKey, detailKey };
}

describe("useCreateCommentMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inserts an optimistic comment immediately and replaces it with the server result", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { commentsKey, listKey, detailKey } = seedCache(queryClient);
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    let resolveComment:
      | ((value: Awaited<ReturnType<typeof createComment>>) => void)
      | undefined;
    const createPromise = new Promise<Awaited<ReturnType<typeof createComment>>>(
      (resolve) => {
        resolveComment = resolve;
      },
    );

    mockCreateComment.mockReturnValue(createPromise);

    const { result } = renderHook(
      () => useCreateCommentMutation("confession-1"),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate({
        content: "New optimistic comment",
        parentId: null,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const optimisticComments =
        queryClient.getQueryData<InfiniteData<GetCommentsResult>>(commentsKey);
      const optimisticDetail =
        queryClient.getQueryData<{ commentCount: number }>(detailKey);
      const optimisticList =
        queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);

      expect(optimisticComments?.pages[0].comments[0].content).toBe(
        "New optimistic comment",
      );
      expect(optimisticComments?.pages[0].comments[0].isOptimistic).toBe(true);
      expect(optimisticDetail?.commentCount).toBe(3);
      expect(optimisticList?.pages[0].confessions[0].commentCount).toBe(3);
    });

    await act(async () => {
      resolveComment?.({
        ok: true,
        data: {
          id: 99,
          content: "New optimistic comment",
          createdAt: "2026-04-23T01:00:00.000Z",
          author: "Anonymous",
          confessionId: "confession-1",
          parentId: null,
          replies: [],
        },
      });
      await createPromise;
    });

    await waitFor(() => {
      const settledComments =
        queryClient.getQueryData<InfiniteData<GetCommentsResult>>(commentsKey);
      expect(settledComments?.pages[0].comments[0].id).toBe(99);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: commentsKey,
      exact: true,
    });
  });

  it("rolls back the optimistic comment and comment count on failure", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { commentsKey, listKey, detailKey } = seedCache(queryClient);

    mockCreateComment.mockResolvedValue({
      ok: false,
      error: {
        message: "Comment failed",
        code: "API_ERROR",
      },
    });

    const { result } = renderHook(
      () => useCreateCommentMutation("confession-1"),
      { wrapper },
    );

    await act(async () => {
      try {
        await result.current.mutateAsync({
          content: "Will fail",
          parentId: null,
        });
      } catch {
        // expected
      }
    });

    const rolledBackComments =
      queryClient.getQueryData<InfiniteData<GetCommentsResult>>(commentsKey);
    const rolledBackDetail = queryClient.getQueryData<{ commentCount: number }>(
      detailKey,
    );
    const rolledBackList =
      queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);

    expect(rolledBackComments?.pages[0].comments).toHaveLength(1);
    expect(rolledBackComments?.pages[0].comments[0].content).toBe(
      "Existing comment",
    );
    expect(rolledBackDetail?.commentCount).toBe(2);
    expect(rolledBackList?.pages[0].confessions[0].commentCount).toBe(2);
  });
});
