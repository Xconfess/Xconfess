import { Request } from 'express';
import { UserRole } from '../../user/entities/user.entity';

/**
 * JWT payload structure stored in the token
 */
export interface JwtPayload {
  sub: number; // User ID (standard JWT claim for subject) - kept as number for consistency
  username: string;
  email: string;
  role: UserRole;
  /**
   * Optional scopes derived from the user role at issuance time.
   * Fine-grained guards can check these instead of coarse role checks.
   */
  scopes?: string[];
  iat?: number; // Issued at (optional, added by JWT)
  exp?: number; // Expiration (optional, added by JWT)
}

/**
 * Request user object attached to req.user after JWT validation
 * This is the canonical interface that should be used throughout the application
 */
export interface RequestUser {
  id: number; // Canonical user ID field
  sub?: number;
  username: string;
  email: string;
  role: UserRole;
  scopes?: string[];
}

/**
 * Type for authenticated HTTP requests
 */
export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
