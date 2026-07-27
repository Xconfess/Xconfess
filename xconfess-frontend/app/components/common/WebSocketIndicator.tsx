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
    <div className="fixed bottom-4 left-4 z-50 flex items-center px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 text-xs font-medium opacity-80 hover:opacity-100 transition-opacity">
      {isConnected ? (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Live</span>
        </>
      ) : isExhausted ? (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Disconnected</span>
        </>
      ) : connectionState === 'reconnecting' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse" />
          <span className="text-gray-600 dark:text-gray-300">Reconnecting... ({reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS})</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Disconnected</span>
        </>
      )}
    </div>
  );
};
