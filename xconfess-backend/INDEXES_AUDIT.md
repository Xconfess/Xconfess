# PostgreSQL Indexes Audit & Verification Report (#1731)

This audit documents critical lookup, filtering, and ordering paths across high-traffic tables in PostgreSQL, confirming explicit index coverage for authentication, feed queries, notifications, reactions, and comments.

---

## Audited Query Paths & Indexes

### 1. User Authentication & Account Recovery (`users` / `user`)
| Query Path / Access Pattern | Indexed Columns | Index Name | Purpose |
|-----------------------------|-----------------|------------|---------|
| Login & Token Verification | `(username, role, is_active)` | `idx_users_auth_lookup` | Accelerates user credential lookups and active session auth guards |
| Email Hash Deduplication | `(email_hash)` | `idx_users_email_hash` | O(1) blind-index lookup for anonymous email uniqueness |
| Password Reset Token Lookup | `(resetPasswordToken, resetPasswordExpires)` | `idx_users_password_reset` | Fast validation and expiration check for password reset tokens |

---

### 2. Anonymous Confessions & Feed Queries (`anonymous_confessions`)
| Query Path / Access Pattern | Indexed Columns | Index Name | Purpose |
|-----------------------------|-----------------|------------|---------|
| Main Feed (Active / Chronological) | `(is_deleted, created_at DESC)` | `idx_confessions_feed_active_created` | Primary feed traversal skipping deleted records |
| Scheduled Feed Dispatch | `(is_deleted, scheduled_for, created_at DESC)` | `idx_confessions_feed_scheduled` | Worker query for releasing scheduled confessions |
| Moderation / Status Filter | `(status, created_at DESC)` | `idx_confessions_status_created` | Admin dashboard and public moderation status filters |
| Gender Demographic Filter | `(gender, created_at DESC)` | `idx_confessions_gender_created` | Filtered demographic exploration feed |
| Author Confession History | `(anonymous_user_id, created_at DESC)` | `idx_confessions_author_created` | User's own anonymous confession management view |
| Trending / Most Viewed | `(is_deleted, view_count DESC)` | `idx_confessions_active_views` | Top-viewed confessions ranking without full table scan |

---

### 3. Notifications & Worker Outbox (`notifications`)
| Query Path / Access Pattern | Indexed Columns | Index Name | Purpose |
|-----------------------------|-----------------|------------|---------|
| User In-App Notification Center | `(userId, isRead, createdAt DESC)` | `idx_notifications_user_feed` | Unread badge counts and paginated notification center feed |
| Background Email Notification Dispatch | `(isEmailSent, createdAt ASC)` | `idx_notifications_email_delivery` | Batch queue polling for undelivered transactional emails |

---

### 4. Reactions & Comments Threading (`reactions`, `comments`)
| Query Path / Access Pattern | Indexed Columns | Index Name | Purpose |
|-----------------------------|-----------------|------------|---------|
| Reaction Aggregation by Type | `(confession_id, type)` | `idx_reactions_confession_type` | Fast aggregation for emoji reaction tallies |
| Comment Hierarchy & Threading | `(confessionId, parentId, createdAt ASC)` | `idx_comments_confession_parent` | Recursive and nested comment tree rendering |
| User Bookmarks Verification | `(userId, confessionId)` | `idx_bookmarks_user_confession` | Instant bookmark state check for rendered cards |

---

## Migration Verification
All indexes are deployed idempotently via `migrations/20260827000001-add-auth-feed-notifications-audit-indexes.ts` with `CREATE INDEX IF NOT EXISTS` and rollback definitions in `down()`.
