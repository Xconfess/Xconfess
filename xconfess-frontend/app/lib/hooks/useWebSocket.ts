import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketEvent {
  id?: string;
  type: string;
  payload: unknown;
  timestamp?: number;
}

export interface WebSocketOptions {
  url: string;
  onMessage?: (event: WebSocketEvent, lastEventId?: string) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onStateChange?: (state: ConnectionState) => void;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  /** Time window for event deduplication in ms */
  deduplicationWindowMs?: number;
  /** Passed as `lastEventId` query param on reconnect for server-side event replay. */
  initialLastEventId?: string;
}

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30000;
const DEFAULT_DEDUP_WINDOW = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced WebSocket hook with reconnection, bounded backoff, and event reconciliation.
 * 
 * Features:
 * - Exponential backoff with jitter (bounded)
 * - Event deduplication using event IDs
 * - Server-side event replay via lastEventId
 * - Connection state visibility
 * - Automatic reconnection with configurable limits
 */
export function useWebSocket(options: WebSocketOptions) {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    onStateChange,
    reconnect = true,
    maxReconnectAttempts = DEFAULT_MAX_ATTEMPTS,
    reconnectBaseDelay = DEFAULT_BASE_DELAY,
    reconnectMaxDelay = DEFAULT_MAX_DELAY,
    deduplicationWindowMs = DEFAULT_DEDUP_WINDOW,
    initialLastEventId,
  } = options;

  const [state, setState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const lastEventIdRef = useRef<string | undefined>(initialLastEventId);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  // Event ID cache for deduplication
  const eventCacheRef = useRef<Map<string, number>>(new Map());

  // Clean up old event IDs from cache periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const cache = eventCacheRef.current;
      for (const [id, timestamp] of cache.entries()) {
        if (now - timestamp > deduplicationWindowMs) {
          cache.delete(id);
        }
      }
    }, deduplicationWindowMs);
    return () => clearInterval(interval);
  }, [deduplicationWindowMs]);

  const setConnectionState = useCallback((newState: ConnectionState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  const buildUrl = useCallback(() => {
    if (!lastEventIdRef.current) return url;
    const u = new URL(url);
    u.searchParams.set('lastEventId', lastEventIdRef.current);
    return u.toString();
  }, [url]);

  const isDuplicateEvent = useCallback((event: WebSocketEvent): boolean => {
    if (!event.id) return false;
    const now = Date.now();
    const cache = eventCacheRef.current;
    const cachedTime = cache.get(event.id);
    if (cachedTime && now - cachedTime < deduplicationWindowMs) {
      return true;
    }
    cache.set(event.id, now);
    return false;
  }, [deduplicationWindowMs]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setConnectionState('connecting');
    const ws = new WebSocket(buildUrl());

    ws.onopen = () => {
      if (!isMountedRef.current || wsRef.current !== ws) return;
      attemptRef.current = 0;
      setReconnectAttempts(0);
      setConnectionState('connected');
      onOpen?.();
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current || wsRef.current !== ws) return;
      try {
        const data = JSON.parse(event.data as string) as WebSocketEvent;
        // Track lastEventId if the server sends it
        if (data && typeof data === 'object' && 'id' in data && data.id) {
          lastEventIdRef.current = String(data.id);
        }
        // Deduplicate events
        if (!isDuplicateEvent(data)) {
          onMessage?.(data, lastEventIdRef.current);
        }
      } catch {
        // Non-JSON message, pass through
        onMessage?.({ type: 'raw', payload: event.data, id: undefined }, lastEventIdRef.current);
      }
    };

    ws.onclose = (closeEvent) => {
      if (!isMountedRef.current || wsRef.current !== ws) return;
      setConnectionState('disconnected');
      onClose?.(closeEvent.code, closeEvent.reason);

      if (reconnect && attemptRef.current < maxReconnectAttempts) {
        attemptRef.current += 1;
        setReconnectAttempts(attemptRef.current);
        // Exponential backoff with jitter
        const baseDelay = reconnectBaseDelay * Math.pow(2, attemptRef.current - 1);
        const jitter = Math.random() * baseDelay * 0.3; // 0-30% jitter
        const delay = Math.min(baseDelay + jitter, reconnectMaxDelay);
        setConnectionState('reconnecting');
        timeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      if (!isMountedRef.current || wsRef.current !== ws) return;
      onError?.(error);
    };

    wsRef.current = ws;
  }, [
    buildUrl,
    reconnect,
    maxReconnectAttempts,
    reconnectBaseDelay,
    reconnectMaxDelay,
    onMessage,
    onOpen,
    onClose,
    onError,
    setConnectionState,
    isDuplicateEvent,
  ]);

  const disconnect = useCallback(() => {
    attemptRef.current = maxReconnectAttempts + 1;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    wsRef.current?.close(1000, 'Client disconnected');
    setConnectionState('disconnected');
  }, [maxReconnectAttempts, setConnectionState]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const forceReconnect = useCallback(() => {
    attemptRef.current = 0;
    setReconnectAttempts(0);
    disconnect();
    // Small delay before reconnecting
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [connect]);

  return { 
    state, 
    reconnectAttempts, 
    connect, 
    disconnect, 
    send,
    forceReconnect,
    lastEventId: lastEventIdRef.current,
  };
}

/**
 * Hook for message-specific WebSocket handling with reconciliation.
 * Provides higher-level API for message events.
 */
export interface MessageWebSocketEvents {
  new_message: { threadId: string; messageId: number; preview: string };
  new_reply: { threadId: string; messageId: number; replyPreview: string };
  message_read: { threadId: string; messageIds: number[] };
  thread_updated: { threadId: string };
}

export function useMessageWebSocket(
  onEvent: (event: keyof MessageWebSocketEvents, payload: MessageWebSocketEvents[keyof MessageWebSocketEvents]) => void,
  options: Omit<WebSocketOptions, 'onMessage' | 'url'> & { url: string }
) {
  const handleMessage = useCallback((event: WebSocketEvent) => {
    if (!event.type || !event.payload) return;
    
    // Map server event types to our typed events
    const eventMap: Record<string, keyof MessageWebSocketEvents> = {
      'message:new': 'new_message',
      'message:reply': 'new_reply',
      'message:read': 'message_read',
      'thread:updated': 'thread_updated',
    };
    
    const mappedType = eventMap[event.type];
    if (mappedType) {
      onEvent(mappedType, event.payload as MessageWebSocketEvents[typeof mappedType]);
    }
  }, [onEvent]);

  return useWebSocket({
    ...options,
    onMessage: handleMessage,
  });
}

export function getReconnectDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}