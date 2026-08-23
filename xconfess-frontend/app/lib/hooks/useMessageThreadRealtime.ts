"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { getWsUrl } from "@/app/lib/config";

export type MessageConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

const POLL_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export interface UseMessageThreadRealtimeOptions {
  enabled?: boolean;
  onPoll?: () => void;
}

export interface UseMessageThreadRealtimeReturn {
  connectionState: MessageConnectionState;
  reconnectAttempts: number;
  isPolling: boolean;
}

/**
 * Hook for messaging thread realtime state — tracks the WebSocket connection
 * and provides a polling fallback for read-receipt status when the socket drops.
 *
 * When connected: emits `subscribe:message-thread` events for the active thread.
 * When disconnected: polls the current thread's read status via the `onPoll` callback.
 * When reconnected: cancels polling, refetches once to sync read status.
 */
export function useMessageThreadRealtime(
  options: UseMessageThreadRealtimeOptions = {},
): UseMessageThreadRealtimeReturn {
  const { enabled = true, onPoll } = options;

  const [connectionState, setConnectionState] =
    useState<MessageConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const attemptRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPollRef = useRef(onPoll);
  const hasConnectedRef = useRef(false);

  // Keep the callback ref fresh
  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current !== null) return; // already polling
    setIsPolling(true);
    // Fire immediately for the first poll
    onPollRef.current?.();
    pollTimerRef.current = setInterval(() => {
      onPollRef.current?.();
    }, POLL_INTERVAL_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState("disconnected");
      startPolling();
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attemptRef.current),
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectTimerRef.current = setTimeout(() => {
      attemptRef.current += 1;
      setReconnectAttempts(attemptRef.current);
      setConnectionState("connecting");
      const socket = io(getWsUrl(), {
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: false,
        forceNew: true,
      });
      socket.on("connect", () => {
        attemptRef.current = 0;
        setReconnectAttempts(0);
        setConnectionState("connected");
        stopPolling();
        // Refetch read statuses on reconnect to sync
        onPollRef.current?.();
        if (hasConnectedRef.current) {
          socket.emit("subscribe:message-thread", {});
        }
        hasConnectedRef.current = true;
      });
      socket.on("disconnect", () => {
        setConnectionState("reconnecting");
        scheduleReconnect();
      });
      socket.on("connect_error", () => {
        setConnectionState("reconnecting");
        scheduleReconnect();
      });
      socketRef.current = socket;
    }, delay);
  }, [startPolling, stopPolling]);

  // Initial connection
  useEffect(() => {
    if (!enabled) return;

    attemptRef.current = 0;
    setConnectionState("connecting");

    const socket = io(getWsUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: false,
      forceNew: true,
    });

    socket.on("connect", () => {
      setConnectionState("connected");
      attemptRef.current = 0;
      setReconnectAttempts(0);
      hasConnectedRef.current = true;
      socket.emit("subscribe:message-thread", {});
    });

    socket.on("disconnect", () => {
      setConnectionState("reconnecting");
      scheduleReconnect();
    });

    socket.on("connect_error", () => {
      setConnectionState("reconnecting");
      scheduleReconnect();
    });

    socketRef.current = socket;

    return () => {
      clearTimers();
      socket.emit("unsubscribe:message-thread", {});
      socket.disconnect();
      socketRef.current = null;
      setConnectionState("disconnected");
      setIsPolling(false);
      attemptRef.current = 0;
      hasConnectedRef.current = false;
    };
  }, [enabled, clearTimers, scheduleReconnect]);

  return {
    connectionState,
    reconnectAttempts,
    isPolling,
  };
}