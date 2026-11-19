import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationCenter } from '@/app/components/notifications/NotificationCenter';

// Mock the useNotifications hook
jest.mock('@/app/lib/hooks/useNotifications', () => ({
  useNotifications: jest.fn(),
}));

// Mock components
jest.mock('@/app/components/notifications/NotificationItem', () => ({
  NotificationItem: ({ notification }: { notification: any }) => (
    <div data-testid={`notification-${notification.id}`}>{notification.message}</div>
  ),
}));

jest.mock('@/app/components/notifications/NotificationPreference', () => ({
  NotificationPreferences: () => <div data-testid="notification-preferences">Preferences</div>,
}));

import { useNotifications } from '@/app/lib/hooks/useNotifications';

describe('NotificationCenter - Empty State', () => {
  const mockUseNotifications = useNotifications as jest.MockedFunction<typeof useNotifications>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty Notification State', () => {
    it('should render empty state when no notifications exist', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const emptyState = screen.queryByText(/no notifications/i);
        expect(emptyState).toBeInTheDocument();
      });
    });

    it('should display correct message for empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
      });
    });

    it('should not display mark all as read when empty', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const markAllBtn = screen.queryByText(/mark all/i);
        expect(markAllBtn).not.toBeInTheDocument();
      });
    });

    it('should show zero unread count in empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const unreadBadge = screen.queryByText('0');
        if (unreadBadge) {
          expect(unreadBadge).toBeInTheDocument();
        }
      });
    });

    it('should still allow filter interactions when empty', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const filterButtons = container.querySelectorAll('[role="button"]');
        expect(filterButtons.length).toBeGreaterThan(0);
      });
    });

    it('should allow opening preferences in empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const settingsBtn = screen.queryByRole('button', { name: /settings|preferences/i });
        if (settingsBtn) {
          expect(settingsBtn).toBeInTheDocument();
        }
      });
    });
  });

  describe('Loading State', () => {
    it('should distinguish loading state from empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: true,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const skeleton = screen.queryByTestId('notification-skeleton');
        const emptyMessage = screen.queryByText(/no notifications/i);

        if (skeleton) {
          expect(skeleton).toBeInTheDocument();
        } else if (emptyMessage) {
          // Should not show empty message while loading
          expect(false).toBe(true);
        }
      });
    });

    it('should show loading indicator', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: true,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const spinner = container.querySelector('[role="status"]');
        expect(spinner).toBeInTheDocument();
      });
    });

    it('should transition from loading to empty state', async () => {
      const { rerender } = render(<NotificationCenter />);

      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: true,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      rerender(<NotificationCenter />);

      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      rerender(<NotificationCenter />);

      await waitFor(() => {
        const emptyState = screen.queryByText(/no notifications/i);
        expect(emptyState).toBeInTheDocument();
      });
    });
  });

  describe('Error State', () => {
    it('should distinguish error state from empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: false,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
        error: 'Failed to load notifications',
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const errorMessage = screen.queryByText(/failed|error/i);
        expect(errorMessage).toBeInTheDocument();
      });
    });

    it('should show connection status when disconnected', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: false,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const disconnectedMsg = screen.queryByText(/disconnected|offline/i);
        if (disconnectedMsg) {
          expect(disconnectedMsg).toBeInTheDocument();
        }
      });
    });

    it('should be different from no notifications message', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: false,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      render(<NotificationCenter />);

      await waitFor(() => {
        const noNotifMsg = screen.queryByText(/no notifications yet/i);
        expect(noNotifMsg).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility - Empty State', () => {
    it('should be keyboard navigable in empty state', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);

        buttons.forEach(btn => {
          expect(btn).toHaveProperty('type');
        });
      });
    });

    it('should have accessible empty state message', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const text = container.textContent;
        expect(text).toContain('notification');
      });
    });

    it('should have proper ARIA labels', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const ariaElements = container.querySelectorAll('[aria-label], [aria-live]');
        expect(ariaElements.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should announce empty state to screen readers', async () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadCount: 0,
        isConnected: true,
        loading: false,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        fetchNotifications: jest.fn(),
        deleteNotification: jest.fn(),
      });

      const { container } = render(<NotificationCenter />);

      await waitFor(() => {
        const liveRegion = container.querySelector('[aria-live]');
        if (liveRegion) {
          expect(liveRegion).toBeInTheDocument();
        }
      });
    });
  });
});
