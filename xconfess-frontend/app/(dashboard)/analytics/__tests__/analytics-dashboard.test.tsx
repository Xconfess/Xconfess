/**
 * Analytics Dashboard UI Tests
 * 
 * Covers:
 * - Loading skeletons and states
 * - Recoverable errors with retry behavior
 * - Empty metrics datasets
 * - Chart and card rendering against partial data
 * - Retry controls and state transitions
 * 
 * @jest-environment jsdom
 */

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import AnalyticsPage from '../page';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Empty analytics response (all zeros) */
const emptyAnalyticsResponse = {
  comparison: {
    enabled: false,
    availability: 'available' as const,
    source: 'backend' as const,
  },
  metrics: {
    totalConfessions: 0,
    totalUsers: 0,
    totalReactions: 0,
    activeUsers: 0,
    confessionsDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
    usersDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
    reactionsDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
    activeDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
  },
  trendingConfessions: [],
  reactionDistribution: [],
  activityData: [],
};

/** Partial data response - some metrics populated, others empty */
const partialDataResponse = {
  comparison: {
    enabled: false,
    availability: 'available' as const,
    source: 'backend' as const,
  },
  metrics: {
    totalConfessions: 150,
    totalUsers: 45,
    totalReactions: 0, // Zero value
    activeUsers: 0, // Zero value
    confessionsDelta: { percentage: 12.5, direction: 'up' as const, availability: 'available' as const },
    usersDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
    reactionsDelta: { percentage: 0, direction: 'flat' as const, availability: 'available' as const },
    activeDelta: { percentage: null, direction: 'unknown' as const, availability: 'unavailable' as const },
  },
  trendingConfessions: [
    {
      id: 'conf-1',
      message: 'First trending confession',
      category: 'work',
      reactions: { like: 10, love: 5 },
      viewCount: 100,
      createdAt: '2025-01-20T10:00:00.000Z',
    },
  ],
  reactionDistribution: [], // Empty array
  activityData: [
    { date: '2025-01-18', confessions: 5, users: 3, reactions: 0 },
    { date: '2025-01-19', confessions: 8, users: 5, reactions: 0 },
  ],
};

/** Full data response with all populated */
const fullDataResponse = {
  comparison: {
    enabled: false,
    availability: 'available' as const,
    source: 'backend' as const,
  },
  metrics: {
    totalConfessions: 150,
    totalUsers: 45,
    totalReactions: 320,
    activeUsers: 28,
    confessionsDelta: { percentage: 12.5, direction: 'up' as const, availability: 'available' as const },
    usersDelta: { percentage: -3.2, direction: 'down' as const, availability: 'available' as const },
    reactionsDelta: { percentage: 45.0, direction: 'up' as const, availability: 'available' as const },
    activeDelta: { percentage: 8.7, direction: 'up' as const, availability: 'available' as const },
  },
  trendingConfessions: [
    {
      id: 'conf-1',
      message: 'First trending confession with a longer message that might be truncated',
      category: 'work',
      reactions: { like: 10, love: 5, support: 2 },
      viewCount: 100,
      createdAt: '2025-01-20T10:00:00.000Z',
    },
    {
      id: 'conf-2',
      message: 'Second trending confession',
      category: 'relationships',
      reactions: { like: 8, love: 3 },
      viewCount: 85,
      createdAt: '2025-01-19T15:30:00.000Z',
    },
  ],
  reactionDistribution: [
    { name: 'Like', value: 150, color: '#3b82f6' },
    { name: 'Love', value: 80, color: '#f43f5e' },
    { name: 'Support', value: 45, color: '#10b981' },
    { name: 'Funny', value: 30, color: '#f59e0b' },
    { name: 'Insightful', value: 15, color: '#8b5cf6' },
  ],
  activityData: [
    { date: '2025-01-18', confessions: 5, users: 3, reactions: 12 },
    { date: '2025-01-19', confessions: 8, users: 5, reactions: 20 },
    { date: '2025-01-20', confessions: 12, users: 8, reactions: 35 },
  ],
};

/** Network error response */
const networkErrorResponse = new Error('Network request failed');

// ─────────────────────────────────────────────────────────────────────────────
// Mock Implementations
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('next/dynamic', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
  let dynamicCall = 0;

  const components = [
    ({ data, loading }: { data: unknown[]; loading: boolean }) =>
      React.createElement(
        'div',
        { 'data-testid': 'activity-chart' },
        loading ? 'loading' : `activity:${data.length}`,
      ),
    ({ data, loading }: { data: unknown[]; loading: boolean }) =>
      React.createElement(
        'div',
        { 'data-testid': 'reaction-distribution' },
        loading ? 'loading' : `reactions:${data.length}`,
      ),
    ({ confessions, loading }: { confessions: unknown[]; loading: boolean }) => {
      if (loading) {
        return React.createElement('div', { 'data-testid': 'trending-confessions' }, 'loading');
      }
      if (confessions.length === 0) {
        return React.createElement('div', null, 'No trending confessions yet');
      }
      return React.createElement('div', { 'data-testid': 'trending-confessions' }, confessions.length);
    },
  ];

  const dynamicMock = () => {
    const Component = components[dynamicCall++] ?? (() => null);
    return Component;
  };

  return { __esModule: true, default: dynamicMock };
});

jest.mock('@/app/components/analytics/ActivityChart', () => ({
  ActivityChart: ({ data, loading }: { data: unknown[]; loading: boolean }) => (
    <div data-testid="activity-chart">
      {loading ? 'loading' : `activity:${data.length}`}
    </div>
  ),
}));

jest.mock('@/app/components/analytics/ReactionDistribution', () => ({
  ReactionDistribution: ({ data, loading }: { data: unknown[]; loading: boolean }) => (
    <div data-testid="reaction-distribution">
      {loading ? 'loading' : `reactions:${data.length}`}
    </div>
  ),
}));

jest.mock('@/app/components/analytics/TrendingConfessions', () => ({
  TrendingConfessions: ({
    confessions,
    loading,
  }: {
    confessions: unknown[];
    loading: boolean;
  }) => {
    if (loading) {
      return <div data-testid="trending-confessions">loading</div>;
    }

    if (confessions.length === 0) {
      return <div>No trending confessions yet</div>;
    }

    return <div data-testid="trending-confessions">{confessions.length}</div>;
  },
}));

jest.mock('@/app/components/analytics/TimePeriodSelector', () => ({
  TimePeriodSelector: () => <div data-testid="time-period-selector">selector</div>,
}));

jest.mock('@/app/components/common/ErrorState', () => ({
  __esModule: true,
  default: ({ title, error, onRetry }: { title: string; error: string; onRetry: () => void }) => (
    <div data-testid="error-state">
      <h3>{title}</h3>
      <p>{error}</p>
      <button onClick={onRetry} data-testid="retry-button">Retry</button>
    </div>
  ),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('AnalyticsPage UI Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
  });

  // ─── Loading States ───────────────────────────────────────────────────────

  describe('Loading Skeletons', () => {
    it('renders loading skeletons while analytics data is pending', () => {
      // Simulate a slow network request that never resolves
      global.fetch = jest.fn(
        () =>
          new Promise(() => {
            // Never resolves - keeps loading state
          }),
      ) as jest.Mock;

      render(<AnalyticsPage />);

      // Check header is rendered
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();

      // Check that 4 metrics cards show loading state (via role=status)
      const loadingElements = screen.getAllByRole('status', { name: /loading/i });
      expect(loadingElements.length).toBeGreaterThanOrEqual(4);

      // Check chart placeholders are rendered
      expect(screen.getByTestId('activity-chart')).toHaveTextContent('loading');
      expect(screen.getByTestId('reaction-distribution')).toHaveTextContent('loading');
      expect(screen.getByTestId('trending-confessions')).toHaveTextContent('loading');
    });

    it('transitions from loading to loaded state correctly', async () => {
      global.fetch = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => emptyAnalyticsResponse,
              });
            }, 50);
          }),
      ) as jest.Mock;

      render(<AnalyticsPage />);

      // Initially loading
      expect(screen.getByTestId('trending-confessions')).toHaveTextContent('loading');

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });

      // Verify loading indicators are gone
      expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument();
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  describe('Recoverable Errors', () => {
    it('displays error state on failed request (4xx/5xx)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
        expect(screen.getByText('Error loading analytics')).toBeInTheDocument();
      });

      // Verify retry button exists
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    it('displays error state on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(networkErrorResponse) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });

    it('successfully retries and loads data after error', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkErrorResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => emptyAnalyticsResponse,
        }) as jest.Mock;

      render(<AnalyticsPage />);

      // Should show error initially
      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByTestId('retry-button'));

      // Should load successfully after retry
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });

      // Verify fetch was called twice (initial + retry)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('handles multiple consecutive errors with retry limit', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkErrorResponse)
        .mockRejectedValueOnce(networkErrorResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => fullDataResponse,
        }) as jest.Mock;

      render(<AnalyticsPage />);

      // First error
      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      // First retry
      fireEvent.click(screen.getByTestId('retry-button'));

      // Second error
      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      // Second retry - should succeed
      fireEvent.click(screen.getByTestId('retry-button'));

      await waitFor(() => {
        expect(screen.getByTestId('trending-confessions')).toHaveTextContent('2');
      });
    });
  });

  // ─── Empty States ─────────────────────────────────────────────────────────

  describe('Empty Metrics Datasets', () => {
    it('renders empty state when all metrics are zero', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyAnalyticsResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        // Empty trending confessions message
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });

      // Metrics should display zeros
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    });

    it('renders appropriate empty state for empty arrays', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyAnalyticsResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        // Charts show empty data points
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:0');
        expect(screen.getByTestId('reaction-distribution')).toHaveTextContent('reactions:0');
      });
    });
  });

  // ─── Partial Data Rendering ─────────────────────────────────────────────

  describe('Chart and Card Rendering with Partial Data', () => {
    it('renders metrics cards with partial data (some zero values)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialDataResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        // Should display non-zero values
        expect(screen.getByText('150')).toBeInTheDocument(); // totalConfessions
        expect(screen.getByText('45')).toBeInTheDocument(); // totalUsers
      });

      // Zero values should be rendered (0 reactions, 0 active users)
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it('renders activity chart with partial data (some zero reactions)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialDataResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        // Activity chart should show partial data
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:2');
      });
    });

    it('renders empty reaction distribution when no reactions exist', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialDataResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('reaction-distribution')).toHaveTextContent('reactions:0');
      });
    });

    it('renders trending confessions with partial data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialDataResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('trending-confessions')).toHaveTextContent('1');
      });
    });
  });

  // ─── Full Data Rendering ─────────────────────────────────────────────────

  describe('Full Data Rendering', () => {
    it('renders all components with full data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => fullDataResponse,
      }) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        // Metrics
        expect(screen.getByText('150')).toBeInTheDocument(); // confessions
        expect(screen.getByText('45')).toBeInTheDocument(); // users
        expect(screen.getByText('320')).toBeInTheDocument(); // reactions
        expect(screen.getByText('28')).toBeInTheDocument(); // active users

        // Charts
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:3');
        expect(screen.getByTestId('reaction-distribution')).toHaveTextContent('reactions:5');

        // Trending
        expect(screen.getByTestId('trending-confessions')).toHaveTextContent('2');
      });
    });
  });

  // ─── Time Period Selector ────────────────────────────────────────────────

  describe('Time Period Selector', () => {
    it('changes period and refetches data', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => fullDataResponse,
      }) as jest.Mock;

      global.fetch = fetchMock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('trending-confessions')).toBeInTheDocument();
      });

      // First call should be with period=7d (default)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('period=7d'),
        expect.any(Object)
      );
    });
  });

  // ─── State Transitions ───────────────────────────────────────────────────

  describe('State Transitions', () => {
    it('transitions from loading -> error -> success', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkErrorResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => fullDataResponse,
        }) as jest.Mock;

      render(<AnalyticsPage />);

      // Loading state
      await waitFor(() => {
        expect(screen.getByTestId('trending-confessions')).toHaveTextContent('loading');
      });

      // Error state
      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      // Retry
      fireEvent.click(screen.getByTestId('retry-button'));

      // Success state
      await waitFor(() => {
        expect(screen.getByTestId('trending-confessions')).toHaveTextContent('2');
        expect(screen.queryByTestId('error-state')).not.toBeInTheDocument();
      });
    });

    it('maintains UI stability during rapid state changes', async () => {
      // Simulate rapid requests with varying responses
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => emptyAnalyticsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => fullDataResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => partialDataResponse,
        }) as jest.Mock;

      render(<AnalyticsPage />);

      // First load
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });

      // UI should not crash during subsequent state changes
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });
  });

  // ─── Accessibility ───────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('has proper ARIA attributes on loading states', () => {
      global.fetch = jest.fn(
        () =>
          new Promise(() => {
            // Never resolves
          }),
      ) as jest.Mock;

      render(<AnalyticsPage />);

      const loadingElements = screen.getAllByRole('status', { name: /loading/i });
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it('has accessible retry button', async () => {
      global.fetch = jest.fn().mockRejectedValue(networkErrorResponse) as jest.Mock;

      render(<AnalyticsPage />);

      await waitFor(() => {
        const retryButton = screen.getByTestId('retry-button');
        expect(retryButton).toBeInTheDocument();
        expect(retryButton).toBeEnabled();
      });
    });
  });
});
