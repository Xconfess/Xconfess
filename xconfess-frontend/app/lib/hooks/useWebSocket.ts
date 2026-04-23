import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30000;

export function useWebSocket(options: WebSocketOptions) {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnect = true,
    maxReconnectAttempts = DEFAULT_MAX_ATTEMPTS,
    reconnectBaseDelay = DEFAULT_BASE_DELAY,
    reconnectMaxDelay = DEFAULT_MAX_DELAY,
  } = options;

  const [state, setState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setState('connecting');
    const ws = new WebSocket(url);

    ws.onopen = () => {
      attemptRef.current = 0;
      setState('connected');
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        onMessage?.(event.data);
      }
    };

    ws.onclose = () => {
      setState('disconnected');
      onClose?.();

      if (reconnect && attemptRef.current < maxReconnectAttempts) {
        attemptRef.current += 1;
        const delay = Math.min(
          reconnectBaseDelay * Math.pow(2, attemptRef.current - 1),
          reconnectMaxDelay
        );
        setState('reconnecting');
        setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    wsRef.current = ws;
  }, [url, reconnect, maxReconnectAttempts, reconnectBaseDelay, reconnectMaxDelay, onMessage, onOpen, onClose, onError]);

  const disconnect = useCallback(() => {
    attemptRef.current = maxReconnectAttempts + 1;
    wsRef.current?.close();
    setState('disconnected');
  }, [maxReconnectAttempts]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, connect, disconnect, send };
}

export function getReconnectDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, maxDelay);
}