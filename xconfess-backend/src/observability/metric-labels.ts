/**
 * Privacy-safe metric label vocabulary.
 *
 * RULE: a metric label value may ONLY ever come from one of the closed sets
 * below. Raw request data (paths, query strings, ids, emails, tokens,
 * confession text, IP addresses, user agents) must never be used as a label.
 *
 * Every function in this file returns a constant from a fixed list, so the
 * number of possible time series is small and known in advance, and no user
 * or confession identifier can leak into the metrics output.
 */

export const HTTP_METHOD_LABELS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'OTHER',
] as const;

export const STATUS_CLASS_LABELS = [
  '1xx',
  '2xx',
  '3xx',
  '4xx',
  '5xx',
  'other',
] as const;

export const ROUTE_CATEGORY_LABELS = [
  'root',
  'health',
  'metrics',
  'auth',
  'users',
  'confessions',
  'confessions_feed',
  'confessions_search',
  'confessions_trending',
  'confessions_tags',
  'confessions_drafts',
  'confessions_comments',
  'confessions_tips',
  'messages',
  'reactions',
  'reports',
  'bookmarks',
  'attachments',
  'notifications',
  'analytics',
  'admin',
  'stellar',
  'wallet',
  'export',
  'webhooks',
  'feature_flags',
  'other',
] as const;

export const FEED_TYPE_LABELS = [
  'public',
  'search',
  'fulltext_search',
  'trending',
  'tag',
  'other',
] as const;

export const FEED_OUTCOME_LABELS = ['success', 'error'] as const;

/** Database connection pool role. Read replicas share the `replica` series. */
export const DB_POOL_LABELS = ['primary', 'replica', 'other'] as const;

export const DB_POOL_STATE_LABELS = [
  'total',
  'idle',
  'active',
  'max',
] as const;

export type HttpMethodLabel = (typeof HTTP_METHOD_LABELS)[number];
export type StatusClassLabel = (typeof STATUS_CLASS_LABELS)[number];
export type RouteCategoryLabel = (typeof ROUTE_CATEGORY_LABELS)[number];
export type FeedTypeLabel = (typeof FEED_TYPE_LABELS)[number];
export type FeedOutcomeLabel = (typeof FEED_OUTCOME_LABELS)[number];
export type DbPoolLabel = (typeof DB_POOL_LABELS)[number];

/** First path segment (after the global `/api` prefix) -> category. */
const TOP_LEVEL_CATEGORIES: Readonly<Record<string, RouteCategoryLabel>> = {
  health: 'health',
  metrics: 'metrics',
  auth: 'auth',
  users: 'users',
  confessions: 'confessions',
  messages: 'messages',
  reactions: 'reactions',
  reports: 'reports',
  bookmarks: 'bookmarks',
  attachments: 'attachments',
  notifications: 'notifications',
  analytics: 'analytics',
  admin: 'admin',
  stellar: 'stellar',
  wallet: 'wallet',
  export: 'export',
  'data-export': 'export',
  webhooks: 'webhooks',
  'feature-flags': 'feature_flags',
};

/** Second path segment under `/confessions` -> more specific category. */
const CONFESSION_SUB_CATEGORIES: Readonly<Record<string, RouteCategoryLabel>> =
  {
    search: 'confessions_search',
    trending: 'confessions_trending',
    tags: 'confessions_tags',
    drafts: 'confessions_drafts',
  };

/** Third path segment under `/confessions/:id/...` -> category. */
const CONFESSION_NESTED_CATEGORIES: Readonly<
  Record<string, RouteCategoryLabel>
> = {
  comments: 'confessions_comments',
  tips: 'confessions_tips',
};

/** Own-property lookup so keys like `constructor` or `__proto__` never match. */
function lookup(
  table: Readonly<Record<string, RouteCategoryLabel>>,
  key: string,
): RouteCategoryLabel | undefined {
  return Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
}

export function normalizeMethod(method: unknown): HttpMethodLabel {
  const upper = typeof method === 'string' ? method.toUpperCase() : '';
  return (HTTP_METHOD_LABELS as readonly string[]).includes(upper)
    ? (upper as HttpMethodLabel)
    : 'OTHER';
}

export function statusClassOf(statusCode: unknown): StatusClassLabel {
  if (typeof statusCode !== 'number' || !Number.isFinite(statusCode)) {
    return 'other';
  }
  const hundreds = Math.floor(statusCode / 100);
  return hundreds >= 1 && hundreds <= 5
    ? (`${hundreds}xx` as StatusClassLabel)
    : 'other';
}

/**
 * Map a request path (raw or a matched route template such as
 * `/api/confessions/:id`) to a safe, low-cardinality category.
 *
 * Only the fixed constants above are ever returned - the input string itself
 * is never echoed, so ids, tokens and query strings cannot reach a label.
 */
export function categorizeRoute(
  method: unknown,
  path: unknown,
): RouteCategoryLabel {
  if (typeof path !== 'string') return 'other';

  // Drop query string / fragment first so they can never influence the result.
  const pathname = path.split(/[?#]/, 1)[0];
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === 'api') segments.shift();

  if (segments.length === 0) return 'root';

  const first = segments[0].toLowerCase();
  const category = lookup(TOP_LEVEL_CATEGORIES, first);
  if (!category) return 'other';

  if (category === 'confessions') {
    if (segments.length === 1) {
      // GET /confessions is the public feed; other verbs are writes.
      return normalizeMethod(method) === 'GET' ? 'confessions_feed' : category;
    }
    const sub = lookup(CONFESSION_SUB_CATEGORIES, segments[1].toLowerCase());
    if (sub) return sub;
    if (segments.length >= 3) {
      const nested = lookup(
        CONFESSION_NESTED_CATEGORIES,
        segments[2].toLowerCase(),
      );
      if (nested) return nested;
    }
  }

  return category;
}
