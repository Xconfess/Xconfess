"use client";

import { useState, useEffect } from "react";
import { Bell, Settings, CheckCheck, Filter, X } from "lucide-react";
import { NotificationItem } from "./NotificationItem";
import { NotificationPreferences } from "./NotificationPreference";
import { NotificationType } from "@/app/types/notifications";
import { useNotifications } from "@/app/lib/hooks/useNotifications";
import { EmptyState } from "@/components/ui/empty-state";

interface NotificationCenterProps {
  onClose?: () => void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const [showPreferences, setShowPreferences] = useState(false);
  const [filterType, setFilterType] = useState<NotificationType | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Get user ID from your auth context
  const userId = "current-user-id"; // Replace with actual user ID

  const {
    notifications,
    unreadCount,
    isConnected,
    loading,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    deleteNotification,
  } = useNotifications(userId);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications({
      type: filterType !== "all" ? filterType : undefined,
      isRead: showUnreadOnly ? false : undefined,
    });
  }, [filterType, showUnreadOnly, fetchNotifications]);

  const filteredNotifications = notifications.filter((notification) => {
    if (showUnreadOnly && notification.isRead) return false;
    if (filterType !== "all" && notification.type !== filterType) return false;
    return true;
  });

  // Empty copy depends on why the list is empty: no notifications at all,
  // an unread-only view with nothing unread, or a filter that matches nothing.
  const hasActiveFilter = showUnreadOnly || filterType !== "all";
  const emptyCopy = !hasActiveFilter
    ? {
        icon: <Bell className="w-6 h-6 text-[var(--text-muted)]" aria-hidden="true" />,
        title: "No notifications yet",
        description: "Activity on your confessions will show up here",
      }
    : showUnreadOnly && filterType === "all"
      ? {
          icon: <CheckCheck className="w-6 h-6 text-[var(--text-muted)]" aria-hidden="true" />,
          title: "All caught up!",
          description: "You've read all your notifications.",
        }
      : {
          icon: <Filter className="w-6 h-6 text-[var(--text-muted)]" aria-hidden="true" />,
          title: "No notifications match these filters",
          description: 'Try another type, or turn off "Show unread only".',
        };

  const notificationTypes = [
    { value: "all", label: "All" },
    { value: NotificationType.REACTION, label: "Reactions" },
    { value: NotificationType.COMMENT, label: "Comments" },
    { value: NotificationType.TIP, label: "Tips" },
    { value: NotificationType.BADGE, label: "Badges" },
    { value: NotificationType.MENTION, label: "Mentions" },
  ];

  if (showPreferences) {
    return (
      <div className="w-96 max-h-[600px] bg-[var(--surface)] rounded-lg border border-[var(--border)] overflow-hidden">
        <NotificationPreferences
          onClose={() => setShowPreferences(false)}
          userId={userId}
        />
      </div>
    );
  }

  return (
    <div className="w-96 max-h-[600px] bg-[var(--surface)] rounded-lg border border-[var(--border)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] bg-[var(--primary)] ">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Notifications</h2>
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-[var(--success)]" : "bg-[var(--danger)]"
                }`}
              />
              <span className="text-xs text-[var(--foreground)] opacity-75">
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowPreferences(true)}
              className="p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors"
              aria-label="Notification settings"
            >
              <Settings className="w-4 h-4 text-[var(--foreground)]" />
            </button>

            {/* Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-[var(--foreground)]" />
              </button>
            )}
          </div>
        </div>

        {/* Unread Count */}
        {unreadCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--foreground)] opacity-90">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-[var(--foreground)] bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)] rounded-full transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-muted)]">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--secondary)]">Filter by:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {notificationTypes.map((type) => (
            <button
              key={type.value}
              onClick={() =>
                setFilterType(type.value as NotificationType | "all")
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filterType === type.value
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] border border-[var(--accent-border)]"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={(e) => setShowUnreadOnly(e.target.checked)}
            className="w-4 h-4 text-[var(--primary-deep)] rounded focus:ring-[var(--focus-ring)]"
          />
          <span className="text-xs text-[var(--secondary)]">Show unread only</span>
        </label>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-border)]"></div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div role="status" className="flex h-40 items-center justify-center">
            <EmptyState
              icon={emptyCopy.icon}
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-muted)]">
        <button
          onClick={() => fetchNotifications()}
          className="w-full text-center text-sm font-medium text-[var(--primary-deep)] hover:text-[var(--primary-deep)] transition-colors"
        >
          View all notifications
        </button>
      </div>
    </div>
  );
}
