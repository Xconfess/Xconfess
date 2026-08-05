'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      // Use the session proxy route — never call the backend directly from
      // client-rendered code. The proxy reads the HttpOnly session cookie.
      const response = await fetch('/api/auth/session');

      if (!response.ok) {
        console.error('Auth refresh failed:', {
          status: response.status,
          path: '/api/auth/session',
        });
        setUser(null);
        return;
      }

      const data = await response.json();
      setUser(data.user ?? null);
    } catch (error) {
      console.error('Auth refresh failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (_token: string) => {
    // Token is already stored in the HttpOnly session cookie by the /api/auth/session
    // proxy when the login POST was made. Just refresh the user state here.
    await refreshUser();
  };

  const logout = () => {
    // Clear session cookie via the proxy route (fire-and-forget)
    fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}