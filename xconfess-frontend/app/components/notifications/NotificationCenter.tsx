"use client";

import { useState, useEffect } from "react";
import { Settings, CheckCheck, Filter, X } from "lucide-react";
import { NotificationItem } from "./NotificationItem";
import { NotificationPreferences } from "./NotificationPreference";
import { NotificationType } from "@/app/types/notifications";
import { useNotifications } from "@/app/lib/hooks/useNotifications";

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
      <div className="w-96 max-h-[600px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        <NotificationPreferences
          onClose={() => setShowPreferences(false)}
          userId={userId}
        />
      </div>
    );
  }

  return (
    <div className="w-96 max-h-[600px] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Notifications</h2>
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="text-xs text-white opacity-75">
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowPreferences(true)}
              className="p-1.5 rounded hover:bg-white/20 transition-colors"
              aria-label="Notification settings"
            >
              <Settings className="w-4 h-4 text-white" />
            </button>

            {/* Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Unread Count */}
        {unreadCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-white opacity-90">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Filter by:</span>
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
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
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
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-xs text-gray-700">Show unread only</span>
        </label>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center p-6">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Filter className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {showUnreadOnly ? "All caught up!" : "No notifications yet"}
            </p>
            <p className="text-xs text-gray-500">
              {showUnreadOnly
                ? "You've read all your notifications."
                : "Activity on your confessions will show up here"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
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
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={() => fetchNotifications()}
          className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all notifications
        </button>
      </div>
    </div>
  );
}
