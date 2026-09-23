/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ConfessionFeed } from "../ConfessionFeed";
import { useInfiniteConfessions } from "../../../lib/hooks/useConfessionsQuery";

const mockReplace = jest.fn();
let mockSearch = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/confessions",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

jest.mock("../../../lib/hooks/useScrollRestoration", () => ({
  useScrollRestoration: jest.fn(),
}));

jest.mock("../../../lib/hooks/useConfessionsQuery", () => ({
  useInfiniteConfessions: jest.fn(),
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
    mockSearch = "";
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

  it("does not expose comparison controls in the public feed", () => {
    render(<ConfessionFeed />);

    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare/i })).not.toBeInTheDocument();
  });

  it("reads the active sort from the URL so back navigation keeps it", () => {
    mockSearch = "sort=trending&q=kept";
    render(<ConfessionFeed />);

    expect(mockUseInfiniteConfessions).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "trending" }),
    );
  });

  it("writes sort changes to the URL without dropping other params", () => {
    mockSearch = "q=kept";
    render(<ConfessionFeed />);

    fireEvent.click(screen.getByRole("tab", { name: "Most discussed" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/confessions?q=kept&sort=most_discussed",
      { scroll: false },
    );
  });
});
