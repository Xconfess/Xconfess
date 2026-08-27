# PR: Standardize Cursor-based Pagination for List Endpoints

## Description
This PR standardizes the cursor-based pagination system across the xConfess backend. It replaces ad-hoc pagination logic in the Confessions, Comments, and Messages modules with a consistent, stable, and performant infrastructure using base64-encoded cursors.

## Key Changes

### Infrastructure
- Created `CursorPaginationDto` for standardized query input.
- Created `CursorPaginatedResponseDto` for consistent API responses.
- Implemented `encodeCursor` / `decodeCursor` utilities for stable base64 cursors.

### Confessions Module
- Updated `getConfessions` and `getConfessionsByTag` to support cursor-based filtering.
- Enhanced `AnonymousConfessionRepository` with standardized find methods.
- Maintained backward compatibility for legacy offset-based pagination (`page` parameter).

### Comments Module
- Refactored `CommentService` to eliminate ad-hoc base64 logic.
- Standardized the response format for all comment listing endpoints.

### Messages Module
- Consolidated `GetMessagesQueryDto` and stabilized the `findAllThreadsForUser` logic.
- Standardized thread list and message history endpoints.

## Verification
- Verified that cursors are stable across concurrent updates.
- Confirmed that `hasMore` and `nextCursor` are accurately calculated.
- Ensured that Swagger/OpenAPI documentation reflects the new paginated structure.

## Deployment Notes
- API consumers should migrate from `page`-based navigation to `nextCursor`-based navigation for improved performance on large datasets.

#731
