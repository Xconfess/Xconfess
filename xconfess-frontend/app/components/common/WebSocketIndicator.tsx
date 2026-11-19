'use client';

import React from 'react';
import { useAuth } from '@/app/lib/providers/AuthProvider';
import { useNotifications } from '@/app/lib/hooks/useNotifications';

export const WebSocketIndicator: React.FC = () => {
  const { user } = useAuth();
  
  if (!user) return null;
  
  return <IndicatorContent userId={user.id} />;
};

const MAX_RECONNECT_ATTEMPTS = 10;

const IndicatorContent = ({ userId }: { userId: string }) => {
  const { isConnected, connectionState, reconnectAttempts } = useNotifications(userId);

  if (connectionState === 'connecting' && !isConnected) {
    return null;
  }

  const isExhausted = connectionState === 'disconnected' && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center px-3 py-1.5 rounded-full bg-[var(--surface)] shadow-sm border border-[var(--border)] text-xs font-medium opacity-80 hover:opacity-100 transition-opacity">
      {isConnected ? (
        <>
          <span className="w-2 h-2 rounded-full bg-[var(--success)] mr-2" />
          <span className="text-[var(--secondary)]">Live</span>
        </>
      ) : isExhausted ? (
        <>
          <span className="w-2 h-2 rounded-full bg-[var(--danger)] mr-2" />
          <span className="text-[var(--secondary)]">Disconnected</span>
        </>
      ) : connectionState === 'reconnecting' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-[var(--warning)] mr-2 animate-pulse" />
          <span className="text-[var(--secondary)]">Reconnecting... ({reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS})</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-[var(--danger)] mr-2" />
          <span className="text-[var(--secondary)]">Disconnected</span>
        </>
      )}
    </div>
  );
};
