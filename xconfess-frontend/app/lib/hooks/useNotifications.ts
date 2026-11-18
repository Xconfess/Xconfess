"use client";

import {
    NotificationFilter,
} from "@/app/types/notifications";
import type { Notification } from "@/app/types/notifications";
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { notificationApi } from "@/app/lib/api/notification";
import { useApiError } from "@/app/lib/hooks/useApiError";
import { getWsUrl } from "@/app/lib/config";

const WS_URL = getWsUrl();

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: (filter?: NotificationFilter) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  playNotificationSound: () => void;
}

export function useNotifications(userId: string): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasConnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedUserRef = useRef<string | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const { handleError } = useApiError({ context: 'Notifications' });
  const debugNotifications =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEBUG_NOTIFICATIONS === 'true';

  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sounds/notification.mp3");
      audioRef.current.volume = 0.5;
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        if (debugNotifications) {
          console.warn('Notification sound playback failed', err);
        }
      });
    }
  }, [debugNotifications]);

  const fetchNotifications = useCallback(
    async (filter?: NotificationFilter) => {
      setLoading(true);
      try {
        const data = await notificationApi.getNotifications(filter);

        data.notifications.forEach((n) => {
          seenNotificationIdsRef.current.add(n.id);
        });

        if (filter?.page && filter.page > 1) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newNotifs = data.notifications.filter((n) => !existingIds.has(n.id));
            return [...prev, ...newNotifs];
          });
        } else {
          setNotifications(data.notifications);
        }

        setUnreadCount(data.unreadCount);
      } catch (error) {
        handleError(error, 'Unable to load notifications. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  const fetchNotificationsRef = useRef(fetchNotifications);
  useEffect(() => {
    fetchNotificationsRef.current = fetchNotifications;
  });

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnectRef = useRef<() => void>(() => {});

  const attachSocketListeners = useCallback((socket: Socket) => {
    socket.on("connect", () => {
      if (debugNotifications) {
        console.debug('Notifications websocket connected');
      }
      setIsConnected(true);
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;
      setReconnectAttempts(0);
      clearReconnectTimer();

      if (subscribedUserRef.current !== userId) {
        socket.emit("join-notifications", userId);
        subscribedUserRef.current = userId;
      }

      if (hasConnectedRef.current) {
        fetchNotificationsRef.current();
      }
      hasConnectedRef.current = true;
    });

    socket.on("disconnect", () => {
      if (debugNotifications) {
        console.debug('Notifications websocket disconnected');
      }
      setIsConnected(false);
      setConnectionState('disconnected');
    });

    socket.on("notification", (notification: Notification) => {
      // Reconnects or repeated socket events do not double-count
      const isAlreadySeen = seenNotificationIdsRef.current.has(notification.id);
      seenNotificationIdsRef.current.add(notification.id);

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) {
          return prev;
        }
        return [notification, ...prev];
      });

      if (!isAlreadySeen && !notification.isRead) {
        setUnreadCount((prev) => prev + 1);
      }

      playNotificationSound();

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(notification.title, {
          body: notification.message,
          icon: "/icons/notification-icon.png",
          badge: "/icons/badge-icon.png",
        });
      }
    });

    socket.on("connect_error", (error) => {
      if (debugNotifications) {
        console.debug('Notifications websocket connection error', error);
      }
      setIsConnected(false);
      setConnectionState('reconnecting');
      scheduleReconnectRef.current();
    });
  }, [userId, playNotificationSound, debugNotifications, clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer();
    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState('disconnected');
      return;
    }
    setConnectionState('reconnecting');
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptRef.current += 1;
      setReconnectAttempts(reconnectAttemptRef.current);
      const token = localStorage.getItem("auth_token");
      const socket = io(WS_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: false,
      });
      attachSocketListeners(socket);
      socketRef.current = socket;
    }, delay);
  }, [clearReconnectTimer, attachSocketListeners]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const markAsRead = useCallback(async (notificationId: string) => {
    let wasUnread = false;

    // Immediately update count and notification status in UI
    setNotifications((prev) =>
      prev.map((notif) => {
        if (notif.id === notificationId) {
          if (!notif.isRead) {
            wasUnread = true;
          }
          return { ...notif, isRead: true };
        }
        return notif;
      })
    );

    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await notificationApi.markAsRead(notificationId);
    } catch (error) {
      // Rollback on failure
      if (wasUnread) {
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId ? { ...notif, isRead: false } : notif
          )
        );
        setUnreadCount((prev) => prev + 1);
      }
      handleError(error, 'Unable to mark notification as read. Please try again.');
    }
  }, [handleError]);

  const markAllAsRead = useCallback(async () => {
    let prevNotifications: Notification[] = [];
    let prevUnreadCount = 0;

    // Immediately zero the badge and flip items
    setNotifications((prev) => {
      prevNotifications = prev;
      return prev.map((notif) => ({ ...notif, isRead: true }));
    });
    setUnreadCount((prev) => {
      prevUnreadCount = prev;
      return 0;
    });

    try {
      await notificationApi.markAllAsRead();
    } catch (error) {
      // Rollback on failure
      setNotifications(prevNotifications);
      setUnreadCount(prevUnreadCount);
      handleError(error, 'Unable to mark all notifications as read. Please try again.');
    }
  }, [handleError]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    let deletedItem: Notification | undefined;
    let wasUnread = false;

    setNotifications((prev) => {
      deletedItem = prev.find((n) => n.id === notificationId);
      if (deletedItem && !deletedItem.isRead) {
        wasUnread = true;
      }
      return prev.filter((notif) => notif.id !== notificationId);
    });

    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await notificationApi.deleteNotification(notificationId);
    } catch (error) {
      // Rollback on failure
      if (deletedItem) {
        setNotifications((prev) => [deletedItem!, ...prev]);
        if (wasUnread) {
          setUnreadCount((prev) => prev + 1);
        }
      }
      handleError(error, 'Unable to delete notification. Please try again.');
    }
  }, [handleError]);

  // Initial WebSocket connection
  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem("auth_token");
    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: false,
    });

    socketRef.current = socket;
    attachSocketListeners(socket);

    return () => {
      clearReconnectTimer();
      subscribedUserRef.current = null;
      socket.disconnect();
    };
  }, [userId, attachSocketListeners, clearReconnectTimer]);

  // Reconcile when the tab becomes visible again
  useEffect(() => {
    if (!userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotificationsRef.current();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [userId]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isConnected,
    connectionState,
    reconnectAttempts,
    loading,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    deleteNotification,
    playNotificationSound,
  };
}
