# Pull Request: Implement User Confessions Endpoint (#723)

## Overview
This PR completes the implementation of the user confessions endpoint, transitioning it from a mock placeholder to a fully functional database-backed feature. It enables users to retrieve their own anonymous confessions with support for standard cursor-based pagination, stable sorting, and filtering.

## Key Changes

### 🛡️ Authorization & Security
- **Strict Ownership**: Users are restricted to fetching only their own confessions using their JWT identity.
- **Admin Access**: Users with the `ADMIN` role are authorized to fetch confessions for any user ID for moderation purposes.
- **Content Decryption**: Confession messages are decrypted using the system `aesKey` before being returned to the client, ensuring the data is readable for the owner.

### 📋 Query & Pagination
- **Cursor Pagination**: Implemented stable cursor-based pagination using the system-wide `CursorPaginatedResponseDto`.
- **Filtering**: Added support for filtering by `moderationStatus` (e.g., approved, pending) and `gender`.
- **Sorting**: Supports `NEWEST` and `TRENDING` sorting orders.

### 🏗️ Architecture & Entities
- **Identity Resolution**: Added logic to resolve all anonymous identities linked to a specific user account.
- **Entity Update**: Exposed `anonymousUserId` in the `AnonymousConfession` entity to improve query performance and simplify the relation bridging.
- **DI Resolution**: Fixed a circular dependency between `UserModule` and `ConfessionModule` using `forwardRef`.

## Verification Results

### Automated Tests
- **Unit Tests**: Updated `ConfessionService` unit tests to cover identity resolution and query building.
- **E2E Tests**: Added `test/user-confessions.e2e-spec.ts` covering:
    - Successful pagination.
    - Status filtering.
    - Unauthorized access prevention (403 Forbidden).
    - Empty state handling.

### Manual Verification
- Verified successful build with `npm run build`.
- Manually audited the TypeORM QueryBuilder output for efficient index usage.

#723
