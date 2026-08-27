"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/app/lib/types/user";

export interface AuthStoreState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        }),

      setAuthenticated: (value) =>
        set({ isAuthenticated: value, error: value ? null : undefined }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      hydrateFromStorage: () => {
        // Hydration from localStorage is disabled for security
        // State will be populated by AuthProvider from session cookie
        if (typeof window === "undefined") return;
      },
    }),
    {
      name: "xconfess-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
