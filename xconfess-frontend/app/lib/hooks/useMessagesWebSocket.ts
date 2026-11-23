import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket, MessageWebSocketEvents } from './useWebSocket';
import { useAuth } from './useAuth';

interface UseMessagesWebSocketOptions {
  onNewMessage?: (threadId: string, messageId: number, preview: string) => void;
  onNewReply?: (threadId: string, messageId: number, replyPreview: string) => void;
  onMessageRead?: (threadId: string, messageIds: number[]) => void;
  onThreadUpdated?: (threadId: string) => void;
  enabled?: boolean;
}

interface ConnectionStatus {
  state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  reconnectAttempts: number;
  lastEventId?: string;
}

export function useMessagesWebSocket(options: UseMessagesWebSocketOptions = {}) {
  const {
    onNewMessage,
    onNewReply,
    onMessageRead,
    onThreadUpdated,
    enabled = true,
  } = options;

  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>({
    state: 'disconnected',
    reconnectAttempts: 0,
  });

  const handleEvent = useCallback((
    event: keyof MessageWebSocketEvents,
    payload: MessageWebSocketEvents[keyof MessageWebSocketEvents]
  ) => {
    switch (event) {
      case 'new_message':
        onNewMessage?.(payload.threadId, payload.messageId, payload.preview);
        break;
      case 'new_reply':
        onNewReply?.(payload.threadId, payload.messageId, payload.replyPreview);
        break;
      case 'message_read':
        onMessageRead?.(payload.threadId, payload.messageIds);
        break;
      case 'thread_updated':
        onThreadUpdated?.(payload.threadId);
        break;
    }
  }, [onNewMessage, onNewReply, onMessageRead, onThreadUpdated]);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
    (process.env.NODE_ENV === 'development' ? 'ws://localhost:4000/socket.io' : 'wss://api.xconfess.com/socket.io');

  const ws = useWebSocket({
    url: `${wsUrl}/messages`,
    onEvent: handleEvent,
    onStateChange: (state) => setStatus(prev => ({ ...prev, state })),
    reconnect: enabled && isAuthenticated,
    maxReconnectAttempts: 10,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000,
    deduplicationWindowMs: 5 * 60 * 1000,
    initialLastEventId: undefined, // Will be set after first connect
    enabled: enabled && isAuthenticated,
  });

  // Update reconnect attempts in status
  useEffect(() => {
    setStatus(prev => ({ ...prev, reconnectAttempts: ws.reconnectAttempts }));
  }, [ws.reconnectAttempts]);

  // Update lastEventId in status
  useEffect(() => {
    setStatus(prev => ({ ...prev, lastEventId: ws.lastEventId }));
  }, [ws.lastEventId]);

  // Handle connection state for UI visibility
  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    
    const handleStateChange = (state: ConnectionStatus['state']) => {
      setStatus(prev => ({ ...prev, state }));
    };
    
    // The onStateChange callback already handles this
  }, [enabled, isAuthenticated]);

  return {
    ...ws,
    status,
    isConnected: status.state === 'connected',
    isReconnecting: status.state === 'reconnecting',
    reconnectAttempts: status.reconnectAttempts,
  };
}

/**
 * Hook for managing message thread state with WebSocket reconciliation.
 * Handles missed message reconciliation after reconnect.
 */
export function useMessageReconciliation(
  threadId: string | null,
  fetchMessages: () => Promise<void>,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;
  const [pendingReconciliation, setPendingReconciliation] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const reconcilingRef = useRef(false);

  // Trigger reconciliation after reconnect
  const triggerReconciliation = useCallback(async () => {
    if (!threadId || reconcilingRef.current || !enabled) return;
    
    reconcilingRef.current = true;
    setPendingReconciliation(true);
    
    try {
      await fetchMessages();
      lastFetchRef.current = Date.now();
    } catch (error) {
      console.error('Message reconciliation failed:', error);
    } finally {
      reconcilingRef.current = false;
      setPendingReconciliation(false);
    }
  }, [threadId, fetchMessages, enabled]);

  // Call this when WebSocket reconnects
  const onReconnect = useCallback(() => {
    if (threadId && enabled) {
      // Small delay to let connection stabilize
      setTimeout(triggerReconciliation, 500);
    }
  }, [threadId, enabled, triggerReconciliation]);

  // Manual reconciliation trigger
  const reconcile = useCallback(() => {
    triggerReconciliation();
  }, [triggerReconciliation]);

  return {
    pendingReconciliation,
    onReconnect,
    reconcile,
    lastFetch: lastFetchRef.current,
  };
}