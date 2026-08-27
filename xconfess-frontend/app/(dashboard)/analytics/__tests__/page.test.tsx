/**
 * @jest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AnalyticsPage from '../page';

jest.mock('next/dynamic', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');

  return (loader: () => Promise<any>, options?: { loading?: () => React.ReactNode }) => {
    return function DynamicComponent(props: Record<string, unknown>) {
      const [Resolved, setResolved] = React.useState<React.ComponentType<any> | null>(null);

      React.useEffect(() => {
        let mounted = true;

        Promise.resolve(loader()).then((mod) => {
          const nextComponent = mod.default ?? mod;
          if (mounted) {
            setResolved(() => nextComponent);
          }
        });

        return () => {
          mounted = false;
        };
      }, []);

      if (!Resolved) {
        return options?.loading ? options.loading() : null;
      }

      return React.createElement(Resolved, props);
    };
  };
});

jest.mock('@/app/components/analytics/ActivityChart', () => ({
  ActivityChart: ({ data, loading }: { data: unknown[]; loading: boolean }) => (
    <div data-testid="activity-chart">{loading ? 'loading' : `activity:${data.length}`}</div>
  ),
}));

jest.mock('@/app/components/analytics/ReactionDistribution', () => ({
  ReactionDistribution: ({ data, loading }: { data: unknown[]; loading: boolean }) => (
    <div data-testid="reaction-distribution">{loading ? 'loading' : `reactions:${data.length}`}</div>
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

const emptyAnalyticsResponse = {
  comparison: {
    enabled: false,
    availability: 'available',
    source: 'backend',
  },
  metrics: {
    totalConfessions: 0,
    totalUsers: 0,
    totalReactions: 0,
    activeUsers: 0,
    confessionsDelta: { percentage: null, direction: 'unknown', availability: 'unavailable' },
    usersDelta: { percentage: null, direction: 'unknown', availability: 'unavailable' },
    reactionsDelta: { percentage: null, direction: 'unknown', availability: 'unavailable' },
    activeDelta: { percentage: null, direction: 'unknown', availability: 'unavailable' },
  },
  trendingConfessions: [],
  reactionDistribution: [],
  activityData: [],
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
  });

  it('renders loading UI while analytics data is pending', () => {
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

    expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    expect(screen.getAllByRole('status', { name: 'loading' })).toHaveLength(4);
  });

  it('renders empty fallback UI when analytics returns no trending data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyAnalyticsResponse,
    }) as jest.Mock;

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
    });
  });

  it('renders server-error fallback and retries successfully', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyAnalyticsResponse,
      }) as jest.Mock;

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading analytics')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('No trending confessions yet')).toBeInTheDocument();
    });
  });
});
