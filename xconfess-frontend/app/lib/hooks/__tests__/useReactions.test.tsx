import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import { useReactions } from "@/app/lib/hooks/useReactions";
import { getConfessionById } from "@/app/lib/api/confessions";
import type {
  GetConfessionByIdResult,
  GetConfessionsResult,
} from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { addReaction } from "@/app/lib/api/reactions";

jest.mock("@/app/lib/api/reactions", () => ({
  addReaction: jest.fn(),
}));

let mockSocketHandlers: Record<string, (...args: unknown[]) => void> = {};
let mockManagerHandlers: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  io: {
    on: jest.fn(),
  },
};
const mockIo = jest.fn((..._args: unknown[]) => mockSocket);
jest.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));
jest.mock("@/app/lib/api/confessions", () => ({
  getConfessionById: jest.fn(),
}));
jest.mock("@/app/lib/config", () => ({
  getWsUrl: () => "ws://localhost:5000",
}));

const mockAddReaction = addReaction as jest.MockedFunction<typeof addReaction>;
const mockGetConfessionById = getConfessionById as jest.MockedFunction<
  typeof getConfessionById
>;

function triggerSocketEvent(event: string, ...args: unknown[]) {
  mockSocketHandlers[event]?.(...args);
}
function triggerManagerEvent(event: string, ...args: unknown[]) {
  mockManagerHandlers[event]?.(...args);
}

function buildConfession(reactions = { like: 2, love: 1 }) {
  return {
    id: "confession-1",
    content: "Test confession",
    createdAt: "2026-04-23T00:00:00.000Z",
    viewCount: 9,
    commentCount: 2,
    reactions,
    author: {
      id: "anonymous",
      username: "Anonymous",
    },
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

function seedConfessionCache(queryClient: QueryClient) {
  const listKey = queryKeys.confessions.list({});
  const detailKey = queryKeys.confessions.detail("confession-1");

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

  queryClient.setQueryData<GetConfessionByIdResult>(detailKey, {
    ...buildConfession(),
  });

  return { listKey, detailKey };
}

describe("useReactions", () => {
  beforeEach(() => {
    mockSocketHandlers = {};
    mockManagerHandlers = {};
    jest.clearAllMocks();
    mockIo.mockReturnValue(mockSocket);
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      mockSocketHandlers[event] = handler;
      return mockSocket;
    });
    mockSocket.io.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      mockManagerHandlers[event] = handler;
      return mockSocket.io;
    });
    mockGetConfessionById.mockResolvedValue({
      ok: true,
      data: buildConfession(),
    });
  });

  it("patches feed/detail caches immediately and avoids broad invalidation when server returns counts", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey, detailKey } = seedConfessionCache(queryClient);
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    let resolveReaction:
      | ((value: Awaited<ReturnType<typeof addReaction>>) => void)
      | undefined;
    const reactionPromise = new Promise<Awaited<ReturnType<typeof addReaction>>>(
      (resolve) => {
        resolveReaction = resolve;
      },
    );

    mockAddReaction.mockReturnValue(reactionPromise);

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      void result.current.addReaction("confession-1", "like");
      await Promise.resolve();
    });

    await waitFor(() => {
      const optimisticList =
        queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
      const optimisticDetail =
        queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

      expect(optimisticList?.pages[0].confessions[0].reactions.like).toBe(3);
      expect(optimisticDetail?.reactions.like).toBe(3);
      expect(result.current.optimisticState?.counts.like).toBe(3);
    });

    await act(async () => {
      resolveReaction?.({
        ok: true,
        data: {
          success: true,
          reactions: { like: 3, love: 1 },
        },
      });
      await reactionPromise;
    });

    await waitFor(() => {
      expect(result.current.optimisticState).toBe(null);
    });

    const settledList = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    const settledDetail = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

    expect(settledList?.pages[0].confessions[0].reactions.like).toBe(3);
    expect(settledDetail?.reactions.like).toBe(3);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("rolls back cache updates when the reaction API returns an application error", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey, detailKey } = seedConfessionCache(queryClient);

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: {
        message: "Reaction failed",
        code: "API_ERROR",
      },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    let response: Awaited<ReturnType<typeof result.current.addReaction>> | undefined;
    await act(async () => {
      response = await result.current.addReaction("confession-1", "love");
    });

    const rolledBackList = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    const rolledBackDetail = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

    expect(response).toEqual({
      ok: false,
      error: {
        message: "Reaction failed",
        code: "MUTATION_ERROR",
      },
    });
    expect(rolledBackList?.pages[0].confessions[0].reactions).toEqual({
      like: 2,
      love: 1,
    });
    expect(rolledBackDetail?.reactions).toEqual({
      like: 2,
      love: 1,
    });
    expect(result.current.optimisticState).toBe(null);
    expect(result.current.error?.message).toBe("Reaction failed");
  });

  it("rolls back the feed list cache when the reaction API fails (feed surface)", async () => {
    const { queryClient, wrapper } = createTestHarness();

    // Seed only the list cache — simulates a user reacting from the feed page
    // without having previously visited the detail page.
    const listKey = queryKeys.confessions.list({});
    queryClient.setQueryData<InfiniteData<GetConfessionsResult>>(listKey, {
      pageParams: [1],
      pages: [{ confessions: [buildConfession()], hasMore: false, page: 1 }],
    });

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Server error", code: "API_ERROR" },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "like");
    });

    const rolledBack = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    expect(rolledBack?.pages[0].confessions[0].reactions).toEqual({ like: 2, love: 1 });
    expect(result.current.optimisticState).toBeNull();
    expect(result.current.error?.message).toBe("Server error");
  });

  it("rolls back the detail cache when the reaction API fails (detail surface)", async () => {
    const { queryClient, wrapper } = createTestHarness();

    // Seed only the detail cache — simulates a user reacting from the
    // confession detail page without the feed being loaded in memory.
    const detailKey = queryKeys.confessions.detail("confession-1");
    queryClient.setQueryData<GetConfessionByIdResult>(detailKey, { ...buildConfession() });

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Server error", code: "API_ERROR" },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "love");
    });

    const rolledBack = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);
    expect(rolledBack?.reactions).toEqual({ like: 2, love: 1 });
    expect(result.current.optimisticState).toBeNull();
    expect(result.current.error?.message).toBe("Server error");
  });

  it("shows rate limit error with retryAfter seconds available", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey } = seedConfessionCache(queryClient);

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Too many requests", code: "TOO_MANY_REQUESTS", retryAfter: 30 },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    let response: Awaited<ReturnType<typeof result.current.addReaction>> | undefined;
    await act(async () => {
      response = await result.current.addReaction("confession-1", "like");
    });

    expect(response).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ retryAfter: 30 }),
      }),
    );
    expect(listKey).toBeDefined();
  });

  it("does not optimistically update when user already has the same reaction type", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey } = seedConfessionCache(queryClient);

    // Backend returns existing reaction (success, but no count change)
    mockAddReaction.mockResolvedValue({
      ok: true,
      data: { success: true, reactions: { like: 2, love: 1 } },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 }, initialUserReaction: "like" }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "like");
    });

    const optimisticList =
      queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);

    // Count should NOT have been incremented (user already had this reaction)
    // The hook skips optimistic update for already-reacted cases
    expect(optimisticList?.pages[0].confessions[0].reactions.like).toBe(2);
    expect(result.current.optimisticState).toBeNull();
  });

  it("subscribes to the reaction websocket and reports connection state", async () => {
    const { wrapper } = createTestHarness();
    const { result } = renderHook(
      () => useReactions({
        confessionId: "confession-1",
        initialCounts: { like: 2, love: 1 },
      }),
      { wrapper },
    );

    expect(mockIo).toHaveBeenCalledWith(
      "ws://localhost:5000/reactions",
      expect.objectContaining({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      }),
    );

    await act(async () => {
      triggerSocketEvent("connect");
    });
    expect(mockSocket.emit).toHaveBeenCalledWith("subscribe:confession", {
      confessionId: "confession-1",
    });
    expect(result.current.connectionState).toBe("connected");

    await act(async () => {
      triggerSocketEvent("disconnect");
    });
    expect(result.current.connectionState).toBe("reconnecting");

    await act(async () => {
      triggerManagerEvent("reconnect_failed");
    });
    expect(result.current.connectionState).toBe("disconnected");
  });

  it("refetches visible reaction counts after reconnect and patches cached confessions", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey, detailKey } = seedConfessionCache(queryClient);

    mockGetConfessionById.mockResolvedValue({
      ok: true,
      data: buildConfession({ like: 8, love: 4 }),
    });

    const { result } = renderHook(
      () => useReactions({
        confessionId: "confession-1",
        initialCounts: { like: 2, love: 1 },
      }),
      { wrapper },
    );

    await act(async () => {
      triggerSocketEvent("connect");
    });
    expect(mockGetConfessionById).not.toHaveBeenCalled();

    await act(async () => {
      triggerSocketEvent("disconnect");
      triggerSocketEvent("connect");
    });

    await waitFor(() => {
      expect(mockGetConfessionById).toHaveBeenCalledWith("confession-1");
    });

    const recoveredList =
      queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    const recoveredDetail =
      queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

    expect(recoveredList?.pages[0].confessions[0].reactions).toEqual({
      like: 8,
      love: 4,
    });
    expect(recoveredDetail?.reactions).toEqual({ like: 8, love: 4 });
    expect(result.current.liveCounts).toEqual({ like: 8, love: 4 });
  });

  it("applies duplicate reaction events only once to visible UI state", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { detailKey } = seedConfessionCache(queryClient);

    const duplicatePayload = {
      confessionId: "confession-1",
      reactionId: "reaction-duplicate-1",
      reactionType: "like",
      timestamp: "2026-06-18T00:00:00.000Z",
    };

    const { result } = renderHook(
      () => useReactions({
        confessionId: "confession-1",
        initialCounts: { like: 2, love: 1 },
      }),
      { wrapper },
    );

    await act(async () => {
      triggerSocketEvent("reaction:added", duplicatePayload);
      triggerSocketEvent("reaction:added", duplicatePayload);
    });

    const recoveredDetail =
      queryClient.getQueryData<GetConfessionByIdResult>(detailKey);
    expect(recoveredDetail?.reactions).toEqual({ like: 3, love: 1 });
    expect(result.current.liveCounts).toEqual({ like: 3, love: 1 });
  });

  it("applies authoritative confession updated counts from the socket", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { detailKey } = seedConfessionCache(queryClient);

    const { result } = renderHook(
      () => useReactions({
        confessionId: "confession-1",
        initialCounts: { like: 2, love: 1 },
      }),
      { wrapper },
    );

    await act(async () => {
      triggerSocketEvent("confession:updated", {
        confessionId: "confession-1",
        reactionCounts: { like: 12, love: 5 },
        timestamp: "2026-06-18T00:00:01.000Z",
      });
    });

    const recoveredDetail =
      queryClient.getQueryData<GetConfessionByIdResult>(detailKey);
    expect(recoveredDetail?.reactions).toEqual({ like: 12, love: 5 });
    expect(result.current.liveCounts).toEqual({ like: 12, love: 5 });
  });
});