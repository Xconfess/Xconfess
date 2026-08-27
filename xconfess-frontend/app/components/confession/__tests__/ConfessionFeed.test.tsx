/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ConfessionFeed } from "../ConfessionFeed";
import { useInfiniteConfessions } from "../../../lib/hooks/useConfessionsQuery";

jest.mock("../../../lib/hooks/useConfessionsQuery", () => ({
  useInfiniteConfessions: jest.fn(),
}));

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockClearItems = jest.fn();
let selectedIds: string[] = [];

jest.mock("../../../lib/store/comparisonStore", () => ({
  useComparisonStore: () => ({
    selectedIds,
    clearItems: mockClearItems,
  }),
}));

jest.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 300,
        size: 300,
      })),
    getTotalSize: () => count * 300,
    measureElement: jest.fn(),
  }),
}));

jest.mock("../ConfessionCard", () => ({
  ConfessionCard: ({ confession }: any) => (
    <div data-testid="confession-card">{confession.content}</div>
  ),
}));

jest.mock("../LoadingSkeleton", () => ({
  ConfessionFeedSkeleton: () => (
    <div data-testid="loading-skeleton">Loading...</div>
  ),
}));

jest.mock("../../common/ErrorState", () => ({
  __esModule: true,
  default: ({ title, description, onRetry }: any) => (
    <div data-testid="error-state">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));

const mockUseInfiniteConfessions =
  useInfiniteConfessions as jest.MockedFunction<typeof useInfiniteConfessions>;

function mockFeedState(overrides: Record<string, unknown> = {}) {
  const baseState = {
    data: {
      pages: [
        {
          confessions: [
            { id: "1", content: "Confession 1" },
            { id: "2", content: "Confession 2" },
          ],
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    error: null,
    refetch: jest.fn(),
  };

  mockUseInfiniteConfessions.mockReturnValue({
    ...baseState,
    ...overrides,
  } as ReturnType<typeof useInfiniteConfessions>);
}

describe("ConfessionFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedIds = [];
    mockFeedState();

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      disconnect = jest.fn();
      observe = jest.fn();
      takeRecords = jest.fn(() => []);
      unobserve = jest.fn();
    }

    window.IntersectionObserver = MockIntersectionObserver;
  });

  it("renders confessions from infinite query pages", () => {
    render(<ConfessionFeed />);

    expect(screen.getAllByTestId("confession-card")).toHaveLength(2);
    expect(screen.getByText("Confession 1")).toBeInTheDocument();
    expect(screen.getByText("Confession 2")).toBeInTheDocument();
    expect(screen.getByText("You've reached the end of the feed")).toBeInTheDocument();
  });

  it("shows a loading skeleton while the feed is loading", () => {
    mockFeedState({ data: undefined, isLoading: true });

    render(<ConfessionFeed />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("shows an error state and retries through refetch", () => {
    const refetch = jest.fn();
    mockFeedState({ data: undefined, error: new Error("Network Error"), refetch });

    render(<ConfessionFeed />);

    expect(screen.getByTestId("error-state")).toHaveTextContent(
      "Unable to load feed",
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state with composer and refresh actions", () => {
    const refetch = jest.fn();
    mockFeedState({
      data: { pages: [{ confessions: [] }] },
      refetch,
    });

    render(<ConfessionFeed />);

    expect(screen.getByRole("region", { name: /empty feed state/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /begin writing/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the comparison inspector when confessions are selected", () => {
    selectedIds = ["1", "2"];

    render(<ConfessionFeed />);

    fireEvent.click(
      screen.getByRole("button", { name: /compare 2 selected confessions/i }),
    );

    expect(mockPush).toHaveBeenCalledWith("/compare?ids=1,2");

    fireEvent.click(screen.getByRole("button", { name: /clear selection queue/i }));

    expect(mockClearItems).toHaveBeenCalledTimes(1);
  });
});
