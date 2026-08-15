/**
 * Authentication-related TypeScript types
 */

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

/**
 * User object returned from the backend
 */
export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;

  totalConfessions?: number;
  totalLikes?: number;
}

/**
 * Response from login endpoint
 */
export interface LoginResponse {
  access_token?: string;
  user: User;
  anonymousUserId?: string;
}

/**
 * Response from register endpoint
 */
export interface RegisterResponse {
  user: User;
}

/**
 * Authentication state
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isSessionExpired: boolean;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  email: string;
  password: string;
  username: string;
}

/**
 * Auth context value
 */
export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}
