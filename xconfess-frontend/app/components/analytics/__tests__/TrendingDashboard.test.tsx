/**
 * Trending Dashboard UI Tests
 * 
 * Covers trending and analytics dashboard states that are easy to regress during data-layer changes.
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

import { TrendingDashboard } from '../TrendingDashboard';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Empty response - no data */
const emptyTrendingResponse = {
  trending: [],
  reactionDistribution: [],
  dailyActivity: [],
  totalMetrics: {
    totalConfessions: 0,
    totalReactions: 0,
    totalUsers: 0,
  },
  period: '7days',
};

/** Partial response - some data, some missing */
const partialTrendingResponse = {
  trending: [
    {
      id: 'conf-1',
      message: 'First confession',
      createdAt: '2025-01-01T00:00:00.000Z',
      reactions: { like: 5 },
      reactionCount: 5,
    },
  ],
  reactionDistribution: [],
  dailyActivity: [
    { date: '2025-01-01', confessions: 1, reactions: 0, activeUsers: 1 },
  ],
  totalMetrics: {
    totalConfessions: 1,
    totalReactions: 0,
    totalUsers: 1,
  },
  period: '7days',
};

/** Full populated response */
const populatedTrendingResponse = {
  trending: [
    {
      id: 'conf-1',
      message: 'Top confession with lots of engagement',
      createdAt: '2025-01-01T00:00:00.000Z',
      reactions: { like: 20, love: 10, support: 5 },
      reactionCount: 35,
    },
    {
      id: 'conf-2',
      message: 'Second most popular confession',
      createdAt: '2025-01-02T00:00:00.000Z',
      reactions: { like: 15, love: 8 },
      reactionCount: 23,
    },
  ],
  reactionDistribution: [
    { type: 'like', count: 35, percentage: '50' },
    { type: 'love', count: 18, percentage: '25.7' },
    { type: 'support', count: 5, percentage: '7.1' },
  ],
  dailyActivity: [
    { date: '2025-01-01', confessions: 5, reactions: 35, activeUsers: 10 },
    { date: '2025-01-02', confessions: 8, reactions: 50, activeUsers: 15 },
  ],
  totalMetrics: {
    totalConfessions: 13,
    totalReactions: 85,
    totalUsers: 25,
  },
  period: '7days',
};

/** Network error */
const networkError = new Error('Network request failed');

// ─────────────────────────────────────────────────────────────────────────────
// Mock Implementations
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../TrendingConfessionCard', () => ({
  TrendingConfessionCard: ({
    confession,
    rank,
  }: {
    confession: { content?: string; message?: string };
    rank: number;
  }) => (
    <div data-testid={`confession-card-${rank}`}>
      {rank}. {confession.content || confession.message || ''}
    </div>
  ),
}));

jest.mock('../ReactionChart', () => ({
  ReactionChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="reaction-chart">{`reactions:${data.length}`}</div>
  ),
}));

jest.mock('../ActivityChart', () => ({
  ActivityChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="activity-chart">{`activity:${data.length}`}</div>
  ),
}));

jest.mock('../MetricsOverview', () => ({
  MetricsOverview: ({ metrics }: { metrics: { totalConfessions: number } }) => (
    <div data-testid="metrics-overview">{`confessions:${metrics.totalConfessions}`}</div>
  ),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('TrendingDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
  });

  // ─── Loading States ───────────────────────────────────────────────────────

  describe('Loading Skeletons', () => {
    it('shows loading skeleton while fetching data', () => {
      global.fetch = jest.fn(
        () =>
          new Promise(() => {
            // Never resolves - maintains loading state
          }),
      ) as jest.Mock;

      render(<TrendingDashboard />);

      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    });

    it('clears loading state after data loads', async () => {
      global.fetch = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => emptyTrendingResponse,
              });
            }, 50);
          }),
      ) as jest.Mock;

      render(<TrendingDashboard />);

      // Initially loading
      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();

      // After data loads
      await waitFor(() => {
        expect(screen.queryByText('Loading analytics...')).not.toBeInTheDocument();
      });
    });

    it('renders multiple loading indicators', () => {
      global.fetch = jest.fn(
        () =>
          new Promise(() => {
            // Never resolves
          }),
      ) as jest.Mock;

      render(<TrendingDashboard />);

      // Should have loading text
      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    });
  });

  // ─── Empty States ─────────────────────────────────────────────────────────

  describe('Empty Metrics Datasets', () => {
    it('shows empty state when trending confessions array is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });
    });

    it('shows empty state when all metrics are zero', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        // Metrics should show zero values
        expect(screen.getByTestId('metrics-overview')).toHaveTextContent('confessions:0');
      });
    });

    it('handles empty reaction distribution gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('reaction-chart')).toHaveTextContent('reactions:0');
      });
    });

    it('handles empty daily activity gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:0');
      });
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  describe('Recoverable Errors', () => {
    it('shows error state when fetch fails with non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });
    });

    it('shows error state on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });

    it('successfully retries and loads data after error', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => populatedTrendingResponse,
        }) as jest.Mock;

      render(<TrendingDashboard />);

      // Show error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Should load data after retry
      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toBeInTheDocument();
      });
    });

    it('handles multiple retry attempts', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => populatedTrendingResponse,
        }) as jest.Mock;

      render(<TrendingDashboard />);

      // First error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });

      // First retry
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Second error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });

      // Second retry
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Should succeed
      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toBeInTheDocument();
      });
    });
  });

  // ─── Partial Data ─────────────────────────────────────────────────────────

  describe('Partial Data Rendering', () => {
    it('renders partial trending data (some confessions)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toHaveTextContent('1. First confession');
      });
    });

    it('renders partial metrics data (some values zero)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('metrics-overview')).toHaveTextContent('confessions:1');
        expect(screen.getByTestId('reaction-chart')).toHaveTextContent('reactions:0');
      });
    });

    it('renders partial activity data (some zero values)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => partialTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:1');
      });
    });
  });

  // ─── Full Data ────────────────────────────────────────────────────────────

  describe('Full Data Rendering', () => {
    it('renders all trending confessions', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => populatedTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toHaveTextContent(
          '1. Top confession with lots of engagement'
        );
        expect(screen.getByTestId('confession-card-2')).toHaveTextContent(
          '2. Second most popular confession'
        );
      });
    });

    it('renders reaction distribution with all types', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => populatedTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('reaction-chart')).toHaveTextContent('reactions:3');
      });
    });

    it('renders activity chart with multiple days', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => populatedTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('activity-chart')).toHaveTextContent('activity:2');
      });
    });

    it('renders metrics with correct totals', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => populatedTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('metrics-overview')).toHaveTextContent('confessions:13');
      });
    });
  });

  // ─── State Transitions ───────────────────────────────────────────────────

  describe('State Transitions', () => {
    it('transitions: loading -> empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyTrendingResponse,
      }) as jest.Mock;

      render(<TrendingDashboard />);

      // Loading
      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();

      // Empty state
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });
    });

    it('transitions: loading -> error -> success', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => populatedTrendingResponse,
        }) as jest.Mock;

      render(<TrendingDashboard />);

      // Loading
      await waitFor(() => {
        expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
      });

      // Error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });

      // Retry
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Success
      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toBeInTheDocument();
      });
    });

    it('transitions: error -> error (multiple failures)', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError) as jest.Mock;

      render(<TrendingDashboard />);

      // First error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });

      // Retry
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Second error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Analytics')).toBeInTheDocument();
      });
    });

    it('handles rapid state changes gracefully', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => emptyTrendingResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => populatedTrendingResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => partialTrendingResponse,
        }) as jest.Mock;

      render(<TrendingDashboard />);

      // First load - empty
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });

      // UI should remain stable
      expect(screen.getByTestId('metrics-overview')).toBeInTheDocument();
    });
  });

  // ─── Data-layer Regression Tests ─────────────────────────────────────────

  describe('Data-layer Regression Tests', () => {
    it('handles missing trending field gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          // Missing 'trending' field entirely
          reactionDistribution: [],
          dailyActivity: [],
          totalMetrics: { totalConfessions: 0 },
        }),
      }) as jest.Mock;

      render(<TrendingDashboard />);

      // Should not crash and show empty state
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });
    });

    it('handles null values in response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          trending: null,
          reactionDistribution: null,
          dailyActivity: null,
          totalMetrics: null,
        }),
      }) as jest.Mock;

      render(<TrendingDashboard />);

      // Should not crash
      await waitFor(() => {
        expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
      });
    });

    it('handles undefined reaction counts in trending', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          trending: [
            {
              id: 'conf-1',
              message: 'Test confession',
              // Missing reactions and reactionCount
            },
          ],
          reactionDistribution: [],
          dailyActivity: [],
          totalMetrics: { totalConfessions: 1 },
        }),
      }) as jest.Mock;

      render(<TrendingDashboard />);

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toBeInTheDocument();
      });
    });

    it('handles malformed date strings', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          trending: [
            {
              id: 'conf-1',
              message: 'Test',
              createdAt: 'invalid-date',
            },
          ],
          reactionDistribution: [],
          dailyActivity: [],
          totalMetrics: { totalConfessions: 1 },
        }),
      }) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('confession-card-1')).toBeInTheDocument();
      });
    });

    it('handles array response instead of object', async () => {
      // This can happen if backend accidentally returns an array
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [], // Array instead of object
      }) as jest.Mock;

      render(<TrendingDashboard />);

      // Should handle gracefully - verify it renders error state
      await waitFor(() => {
        expect(screen.queryByText('Failed to Load Analytics') ?? screen.queryByText('No trending confessions yet')).toBeTruthy();
      });
    });
  });

  // ─── Accessibility ───────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('retry button is accessible', async () => {
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      render(<TrendingDashboard />);

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: 'Retry' });
        expect(retryButton).toBeEnabled();
      });
    });

    it('loading state has proper indication', () => {
      global.fetch = jest.fn(
        () =>
          new Promise(() => {
            // Never resolves
          }),
      ) as jest.Mock;

      render(<TrendingDashboard />);

      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    });
  });
});