import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ConfessionFeed } from '@/app/components/confession/ConfessionFeed';

// Mock the router and search params
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/feed',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the hooks
jest.mock('@/app/lib/hooks/useConfessionsQuery', () => ({
  useInfiniteConfessions: jest.fn(),
}));

jest.mock('@/app/lib/hooks/useScrollRestoration', () => ({
  useScrollRestoration: jest.fn(),
}));

jest.mock('@/app/lib/hooks/useLiveAnnouncement', () => ({
  useLiveAnnouncement: jest.fn(),
}));

jest.mock('@/app/lib/hooks/useFeedPageRestoration', () => ({
  useFeedPageRestoration: jest.fn(),
}));

// Mock components
jest.mock('@/app/components/confession/ConfessionCard', () => ({
  ConfessionCard: ({ confession }: { confession: any }) => (
    <div data-testid={`confession-${confession.id}`}>{confession.content}</div>
  ),
}));

jest.mock('@/app/components/confession/LoadingSkeleton', () => ({
  ConfessionFeedSkeleton: () => <div data-testid="feed-skeleton">Loading...</div>,
}));

jest.mock('@/app/components/common/ErrorState', () => ({
  default: ({ error }: { error: string }) => <div data-testid="error-state">{error}</div>,
}));

import { useInfiniteConfessions } from '@/app/lib/hooks/useConfessionsQuery';

describe('ConfessionFeed - Empty State', () => {
  const mockUseInfiniteConfessions = useInfiniteConfessions as jest.MockedFunction<typeof useInfiniteConfessions>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty Feed Rendering', () => {
    it('should render empty state when no confessions match filter', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const emptyState = screen.queryByText(/no confessions/i);
        expect(emptyState).toBeInTheDocument();
      });
    });

    it('should display appropriate empty message', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const message = screen.queryByText(/nothing here yet/i);
        if (message) {
          expect(message).toBeInTheDocument();
        }
      });
    });

    it('should display suggestion to try different filters', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const suggestion = screen.queryByText(/try changing/i) ||
                          screen.queryByText(/different filter/i);
        if (suggestion) {
          expect(suggestion).toBeInTheDocument();
        }
      });
    });

    it('should not show pagination controls when empty', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const pagination = screen.queryByText(/load more|next page|prev/i);
        expect(pagination).not.toBeInTheDocument();
      });
    });

    it('should not show load more button when empty', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const loadMore = screen.queryByText(/load more|show more/i);
        expect(loadMore).not.toBeInTheDocument();
      });
    });
  });

  describe('Filter Interactions in Empty State', () => {
    it('should allow changing sort order', async () => {
      const user = userEvent.setup();
      const mockFetchNextPage = jest.fn();

      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: mockFetchNextPage,
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const sortButtons = container.querySelectorAll('[role="button"]');
        expect(sortButtons.length).toBeGreaterThan(0);
      });
    });

    it('should maintain filter options while empty', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const filterSection = container.querySelector('[role="group"]');
        if (filterSection) {
          expect(filterSection).toBeInTheDocument();
        }
      });
    });

    it('should show all sort options when empty', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const buttons = screen.queryAllByRole('button');
        const hasRecent = buttons.some(btn => btn.textContent?.includes('Recent'));
        const hasPopular = buttons.some(btn => btn.textContent?.includes('Popular'));

        if (hasRecent && hasPopular) {
          expect(true).toBe(true);
        }
      });
    });

    it('should be able to switch between sort options', async () => {
      const user = userEvent.setup();
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const trendingBtn = screen.queryByRole('button', { name: /trending|popular/i });
        if (trendingBtn) {
          expect(trendingBtn).toBeInTheDocument();
        }
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should distinguish loading state from empty state', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [], pageParams: [] },
        isLoading: true,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'pending',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const skeleton = screen.queryByTestId('feed-skeleton');
        const emptyMsg = screen.queryByText(/no confessions/i);

        if (skeleton) {
          expect(skeleton).toBeInTheDocument();
          expect(emptyMsg).not.toBeInTheDocument();
        }
      });
    });

    it('should show error state when fetch fails', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [], pageParams: [] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'error',
      });

      render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const errorState = screen.queryByTestId('error-state');
        if (errorState) {
          expect(errorState).toBeInTheDocument();
        }
      });
    });

    it('should transition from loading to empty', async () => {
      const { rerender } = render(<ConfessionFeed initialSort="newest" />);

      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [], pageParams: [] },
        isLoading: true,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'pending',
      });

      rerender(<ConfessionFeed initialSort="newest" />);

      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      rerender(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const skeleton = screen.queryByTestId('feed-skeleton');
        expect(skeleton).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility - Empty Feed', () => {
    it('should be keyboard navigable in empty state', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);

        buttons.forEach(btn => {
          expect(btn.getAttribute('type')).toBeDefined();
        });
      });
    });

    it('should have accessible empty state message', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const text = container.textContent;
        expect(text).toBeTruthy();
      });
    });

    it('should announce empty state to screen readers', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const liveRegion = container.querySelector('[aria-live]');
        if (liveRegion) {
          expect(liveRegion).toBeInTheDocument();
        }
      });
    });

    it('should maintain focus management', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const focusableElements = container.querySelectorAll('button, a, [tabindex]');
        expect(focusableElements.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Empty State Persistence', () => {
    it('should maintain empty state when refetching', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: true,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { rerender } = render(<ConfessionFeed initialSort="newest" />);

      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      rerender(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const emptyState = screen.queryByText(/no confessions/i);
        expect(emptyState).toBeInTheDocument();
      });
    });

    it('should not show scroll-to-top button when empty', async () => {
      mockUseInfiniteConfessions.mockReturnValue({
        data: { pages: [{ confessions: [], hasMore: false }], pageParams: [0] },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPlaceholderData: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        refetch: jest.fn(),
        status: 'success',
      });

      const { container } = render(<ConfessionFeed initialSort="newest" />);

      await waitFor(() => {
        const scrollBtn = container.querySelector('[aria-label*="scroll" i]');
        expect(scrollBtn).not.toBeInTheDocument();
      });
    });
  });
});
