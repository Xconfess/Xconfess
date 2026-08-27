/**
 * Canonical query key taxonomy for React Query cache management.
 *
 * Structure: [domain, subdomain?, scope?, params?]
 *
 * Invalidation policy:
 *   - Use *.all() to broadly invalidate an entire domain (e.g. after socket events,
 *     logout, or cross-cutting mutations). React Query prefix-matches these.
 *   - Use *.list(filters) / *.detail(id) for precise getQueryData / setQueryData
 *     where you need the exact cache entry (e.g. optimistic update snapshots).
 *   - After every mutation that changes visible list data, call
 *     invalidateQueries({ queryKey: <domain>.all() }) in onSettled so stale
 *     server state is always reconciled even when optimistic updates fail.
 */

export const queryKeys = {
  // ── Public / user-facing ────────────────────────────────────────────────
  confessions: {
    all: ["confessions"] as const,
    lists: () => ["confessions", "list"] as const,
    list: (params?: Record<string, unknown>) =>
      ["confessions", "list", params ?? {}] as const,
    details: () => ["confessions", "detail"] as const,
    detail: (id: string) => ["confessions", "detail", id] as const,
  },

  comments: {
    all: ["comments"] as const,
    byConfession: (confessionId: string) =>
      ["comments", "byConfession", confessionId] as const,
  },
  comparison: {
    all: ["comparison"] as const,
    list: (itemIds: string[]) => ["comparison", "list", itemIds] as const,
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  // Top-level "admin" prefix lets you wipe all admin cache in one call:
  //   queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() })
  admin: {
    all: () => ["admin"] as const,

    reports: {
      // ["admin", "reports"] — invalidates every report query
      all: () => ["admin", "reports"] as const,
      // ["admin", "reports", "list", { statusFilter, typeFilter, … }]
      list: (filters: Record<string, unknown>) =>
        ["admin", "reports", "list", filters] as const,
      // ["admin", "reports", "stats"]
      stats: () => ["admin", "reports", "stats"] as const,
    },

    users: {
      // ["admin", "users"] — invalidates every user query
      all: () => ["admin", "users"] as const,
      // ["admin", "users", "search", { query, page }]
      search: (query: string, page: number) =>
        ["admin", "users", "search", { query, page }] as const,
      // ["admin", "users", "history", userId]
      history: (userId: string) =>
        ["admin", "users", "history", userId] as const,
    },

    auditLogs: {
      // ["admin", "auditLogs"] — invalidates every audit-log query
      all: () => ["admin", "auditLogs"] as const,
      // ["admin", "auditLogs", "list", { actionFilter, entityTypeFilter, page }]
      list: (filters: Record<string, unknown>) =>
        ["admin", "auditLogs", "list", filters] as const,
      // ["admin", "auditLogs", "entity", entityType, entityId]
      byEntity: (entityType: string, entityId: string) =>
        ["admin", "auditLogs", "entity", entityType, entityId] as const,
    },

    analytics: {
      // ["admin", "analytics"]
      all: () => ["admin", "analytics"] as const,
    },

    observability: {
      all: () => ["admin", "observability"] as const,
      list: (params?: Record<string, unknown>) =>
        ["admin", "observability", params ?? {}] as const,
    },

    notificationJobs: {
      // ["admin", "notificationJobs"] — invalidates every job query
      all: () => ["admin", "notificationJobs"] as const,
      // ["admin", "notificationJobs", "list", filter]
      list: (filter: Record<string, unknown>) =>
        ["admin", "notificationJobs", "list", filter] as const,
    },
  },
} as const;
