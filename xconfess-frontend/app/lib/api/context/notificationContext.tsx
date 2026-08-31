// context/NotificationContext.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";
import { useNotifications, ConnectionState } from "@/app/lib/hooks/useNotifications";
import { Notification } from "@/app/types/notifications";

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: (filter?: any) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  playNotificationSound: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const notificationState = useNotifications(userId);

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotificationContext must be used within a NotificationProvider"
    );
  }
  return context;
}

// Example usage in layout.tsx:
/*
import { NotificationProvider } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';

export default function DashboardLayout({ children }) {
  const { user } = useAuth();
  
  return (
    <NotificationProvider userId={user?.id}>
      <div className="min-h-screen">
        <header>
          <NotificationBell 
            unreadCount={notifications.unreadCount}
          />
        </header>
        {children}
      </div>
    </NotificationProvider>
  );
}
*/
