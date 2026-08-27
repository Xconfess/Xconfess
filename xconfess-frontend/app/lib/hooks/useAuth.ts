"use client";

import { useAuthContext } from '../providers/AuthProvider';
import { AuthContextValue } from '../types/auth';

/**
 * Custom hook for authentication
 * 
 * Provides access to authentication state and methods.
 * Must be used within an AuthProvider.
 * 
 * @returns Authentication context value with state and methods
 */
export function useAuth(): AuthContextValue {
  return useAuthContext();
}
