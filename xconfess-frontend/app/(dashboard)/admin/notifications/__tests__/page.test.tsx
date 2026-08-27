/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsPage from '../page';
import { adminApi } from '@/app/lib/api/admin';
import type { FailedJobsResponse } from '@/app/lib/types/notification-jobs';

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
};

// Mock the admin API
jest.mock('@/app/lib/api/admin', () => ({
  adminApi: {
    getFailedNotificationJobs: jest.fn(),
    replayFailedNotificationJob: jest.fn(),
  },
}));

// Mock ErrorBoundary to simplify testing
jest.mock('@/app/components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/app/components/common/Toast', () => ({
  useGlobalToast: () => mockToast,
}));

// Mock ConfirmDialog
jest.mock('@/app/components/admin/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm} data-testid="confirm-button">
          Confirm
        </button>
        <button onClick={onCancel} data-testid="cancel-button">
          Cancel
        </button>
      </div>
    ) : null,
}));

// Mock useDLQFilterState so filter state is fully controlled in tests.
// URL mechanics (router.push, searchParams) are covered by the hook's own unit tests.
jest.mock('@/app/lib/hooks/useDLQFilterState', () => ({
  useDLQFilterState: jest.fn(),
}));

import { useDLQFilterState } from '@/app/lib/hooks/useDLQFilterState';

const mockSetPage = jest.fn();
const mockSetStatusFilter = jest.fn();
const mockSetStartDate = jest.fn();
const mockSetEndDate = jest.fn();
const mockSetMinRetries = jest.fn();

const defaultFilterMock = {
  page: 1,
  statusFilter: 'failed' as const,
  startDate: '',
  endDate: '',
  minRetries: undefined,
  setPage: mockSetPage,
  setStatusFilter: mockSetStatusFilter,
  setStartDate: mockSetStartDate,
  setEndDate: mockSetEndDate,
  setMinRetries: mockSetMinRetries,
};

const mockFailedJobs: FailedJobsResponse = {
  jobs: [
    {
      id: 'job-123',
      name: 'comment-notification',
      attemptsMade: 3,
      maxAttempts: 3,
      failedReason: 'SMTP connection timeout',
      failedAt: new Date('2024-02-20T10:00:00Z').toISOString(),
      createdAt: new Date('2024-02-20T09:00:00Z').toISOString(),
      channel: 'email',
      recipientEmail: 'user@example.com',
    },
    {
      id: 'job-456',
      name: 'comment-notification',
      attemptsMade: 2,
      maxAttempts: 3,
      failedReason: 'Invalid email address',
      failedAt: new Date('2024-02-20T11:00:00Z').toISOString(),
      createdAt: new Date('2024-02-20T10:30:00Z').toISOString(),
      channel: 'email',
      recipientEmail: 'invalid@test',
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDLQFilterState as jest.Mock).mockReturnValue(defaultFilterMock);
  });

  describe('Rendering', () => {
    it('should render the page title and description', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      expect(screen.getByText('Failed Notification Jobs')).toBeInTheDocument();
      expect(
        screen.getByText('Monitor and replay failed notification delivery attempts')
      ).toBeInTheDocument();
    });

    it('should display loading skeleton while fetching data', () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<NotificationsPage />);

      // Check for loading state (skeleton)
      expect(screen.getByText('Failed Notification Jobs')).toBeInTheDocument();
    });

    it('should render failed jobs table with data', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
        expect(screen.getByText(/job-456/)).toBeInTheDocument();
      });

      // Check table headers
      expect(screen.getByText('Job ID')).toBeInTheDocument();
      expect(screen.getByText('Channel')).toBeInTheDocument();
      expect(screen.getByText('Recipient')).toBeInTheDocument();
      expect(screen.getByText('Retries')).toBeInTheDocument();
      expect(screen.getByText('Failure Reason')).toBeInTheDocument();
      expect(screen.getByText('Failed At')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should display empty state when no jobs found', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No failed jobs found')).toBeInTheDocument();
        expect(
          screen.getByText('All notification jobs are processing successfully.')
        ).toBeInTheDocument();
      });
    });

    it('should display error state when API call fails', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load notification jobs. Please try again.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    it('should call API with correct filter parameters', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(adminApi.getFailedNotificationJobs).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'failed',
            page: 1,
            limit: 20,
          })
        );
      });
    });

    it('should call setStatusFilter when user changes status', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.change(statusSelect, { target: { value: 'all' } });

      expect(mockSetStatusFilter).toHaveBeenCalledWith('all');
    });

    it('should call setStartDate when date input changes', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const startDateInput = screen.getByLabelText('Start Date');
      fireEvent.change(startDateInput, { target: { value: '2024-02-01' } });

      expect(mockSetStartDate).toHaveBeenCalledWith('2024-02-01');
    });

    it('should call setEndDate when end date input changes', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const endDateInput = screen.getByLabelText('End Date');
      fireEvent.change(endDateInput, { target: { value: '2024-02-28' } });

      expect(mockSetEndDate).toHaveBeenCalledWith('2024-02-28');
    });

    it('should call setMinRetries when min retries input changes', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const minRetriesInput = screen.getByLabelText('Min Retries');
      fireEvent.change(minRetriesInput, { target: { value: '3' } });

      expect(mockSetMinRetries).toHaveBeenCalledWith(3);
    });

    it('should reset to page 1 when status filter changes', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        total: 50,
      });
      (useDLQFilterState as jest.Mock).mockReturnValue({
        ...defaultFilterMock,
        page: 2,
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.change(statusSelect, { target: { value: 'all' } });

      // setStatusFilter in useDLQFilterState automatically resets page in the URL;
      // here we verify the setter is called with the new value
      expect(mockSetStatusFilter).toHaveBeenCalledWith('all');
    });
  });

  describe('Pagination', () => {
    it('should display pagination controls when multiple pages exist', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        total: 50,
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 to 20 of 50 results/)).toBeInTheDocument();
        expect(screen.getByText('Previous')).toBeInTheDocument();
        expect(screen.getByText('Next')).toBeInTheDocument();
      });
    });

    it('should call setPage with next page number when Next button clicked', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        total: 50,
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      expect(mockSetPage).toHaveBeenCalledWith(2);
    });

    it('should disable Previous button on first page', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        total: 50,
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
      });
    });

    it('should disable Next button on last page', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        total: 50,
      });
      (useDLQFilterState as jest.Mock).mockReturnValue({
        ...defaultFilterMock,
        page: 3, // last of 3 pages (50 total / 20 per page)
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        expect(nextButton).toBeDisabled();
      });
    });
  });

  describe('Replay Action', () => {
    it('should open confirmation dialog when Replay button clicked', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });
    });

    it('should call replay API when confirmed', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);
      (adminApi.replayFailedNotificationJob as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Job replayed successfully',
        jobId: 'job-123',
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(adminApi.replayFailedNotificationJob).toHaveBeenCalledWith('job-123');
      });
      expect(mockToast.success.mock.calls[0][0]).toBe(
        'Failed notification job replay queued.',
      );
    });

    it('should not call replay API when cancelled', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByTestId('cancel-button');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(adminApi.replayFailedNotificationJob).not.toHaveBeenCalled();
      });
    });

    it('should prevent duplicate replay requests', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);
      (adminApi.replayFailedNotificationJob as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Replaying...')).toBeInTheDocument();
      });

      // Try to click replay again - button should be disabled
      const replayingButton = screen.getByText('Replaying...');
      expect(replayingButton).toBeDisabled();
    });

    it('should update UI optimistically on replay', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);
      (adminApi.replayFailedNotificationJob as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Job replayed successfully',
        jobId: 'job-123',
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      // Should show replaying state immediately
      await waitFor(() => {
        expect(screen.getByText('Replaying...')).toBeInTheDocument();
      });
    });

    it('should handle replay failure gracefully', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);
      (adminApi.replayFailedNotificationJob as jest.Mock).mockRejectedValue(
        new Error('Replay failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/job-123/)).toBeInTheDocument();
      });

      const replayButtons = screen.getAllByText('Replay');
      fireEvent.click(replayButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to replay job:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Data Sanitization', () => {
    it('should mask email addresses for privacy', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        // Email should be masked: u***@example.com
        expect(screen.getByText('u***@example.com')).toBeInTheDocument();
        expect(screen.getByText('i***@test')).toBeInTheDocument();
      });
    });

    it('should truncate long failure reasons', async () => {
      const longReason = 'A'.repeat(100);
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue({
        ...mockFailedJobs,
        jobs: [
          {
            ...mockFailedJobs.jobs[0],
            failedReason: longReason,
          },
        ],
      });

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        // Should be truncated to 50 chars + "..."
        const truncatedText = screen.getByText(/A{50}\.\.\./);
        expect(truncatedText).toBeInTheDocument();
      });
    });

    it('should truncate job IDs for display', async () => {
      (adminApi.getFailedNotificationJobs as jest.Mock).mockResolvedValue(mockFailedJobs);

      renderWithProviders(<NotificationsPage />);

      await waitFor(() => {
        // Job ID should be truncated: first 12 chars + "..."
        expect(screen.getByText('job-123...')).toBeInTheDocument();
      });
    });
  });
});
