import { UserRole } from '../entities/user.entity';

/**
 * Canonical response schema for an authenticated profile lookup.
 *
 * Both GET /api/auth/me and GET /api/users/profile MUST return exactly
 * these fields — no more, no less.  Internal fields (password hash,
 * reset tokens, raw email ciphertext) are intentionally excluded.
 */
export interface UserResponse {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  email: string;
  notificationPreferences: Record<string, boolean>;
  privacy: {
    isDiscoverable: boolean;
    canReceiveReplies: boolean;
    showReactions: boolean;
    dataProcessingConsent: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
