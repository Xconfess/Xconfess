/**
 * Cache Key Namespace Convention
 *
 * Format: <namespace>:<entity-type>:<specific-identifier>[:<additional-context>]
 *
 * Namespace: Top-level category (e.g., 'analytics', 'user', 'confession')
 * EntityType: The type of entity being cached (e.g., 'stats', 'trending', 'profile')
 * SpecificIdentifier: Unique identifier (e.g., ID, days parameter)
 * AdditionalContext: Optional sub-category or variant
 *
 * Examples:
 *   - analytics:trending:7d     (trending analytics for 7 days)
 *   - analytics:stats           (platform statistics)
 *   - analytics:reactions:30d   (reaction distribution for 30 days)
 *   - user:profile:uuid        (user profile by ID)
 *   - confession:views:uuid    (confession view count by ID)
 *   - views:confession:uuid   (confession views)
 */

export const CacheNamespace = {
  ANALYTICS: 'analytics',
  USER: 'user',
  CONFESSION: 'confession',
  REACTION: 'reaction',
  VIEWS: 'views',
  SESSION: 'session',
  NOTIFICATION: 'notification',
} as const;

export const AnalyticsEntityType = {
  TRENDING: 'trending',
  STATS: 'stats',
  REACTIONS: 'reactions',
  GROWTH: 'growth',
  USERS: 'users',
  ACTIVITY: 'activity',
} as const;

export const UserEntityType = {
  PROFILE: 'profile',
  SETTINGS: 'settings',
  SESSIONS: 'sessions',
} as const;

export const ConfessionEntityType = {
  CONTENT: 'content',
  VIEWS: 'views',
  DRAFT: 'draft',
} as const;

export const ReactionEntityType = {
  DISTRIBUTION: 'distribution',
  COUNTS: 'counts',
} as const;

/**
 * Cache key builder with namespace convention enforcement
 */
export class CacheKeyBuilder {
  private readonly namespace: string;
  private readonly parts: string[] = [];

  constructor(namespace: string) {
    this.namespace = namespace.toLowerCase();
    this.parts.push(this.namespace);
  }

  /**
   * Add entity type to the key
   */
  entity(entityType: string): CacheKeyBuilder {
    this.parts.push(entityType.toLowerCase());
    return this;
  }

  /**
   * Add specific identifier (ID, days, etc.)
   */
  identifier(value: string | number): CacheKeyBuilder {
    this.parts.push(String(value));
    return this;
  }

  /**
   * Add optional context (variant, sub-type)
   */
  context(context: string): CacheKeyBuilder {
    this.parts.push(context.toLowerCase());
    return this;
  }

  /**
   * Build the final cache key
   */
  build(): string {
    return this.parts.join(':');
  }
}

/**
 * Pre-built key generators for analytics
 */
export const AnalyticsCacheKeys = {
  /**
   * Trending confessions: analytics:trending:7d or analytics:trending:30d
   */
  trending: (days: number = 7): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.TRENDING)
      .identifier(`${days}d`)
      .build(),

  /**
   * Platform stats: analytics:stats
   */
  stats: (): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.STATS)
      .build(),

  /**
   * Reaction distribution: analytics:reactions:7d or analytics:reactions:30d
   */
  reactions: (days: number = 7): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.REACTIONS)
      .identifier(`${days}d`)
      .build(),

  /**
   * Growth metrics: analytics:growth:7d or analytics:growth:30d
   */
  growth: (days: number = 7): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.GROWTH)
      .identifier(`${days}d`)
      .build(),

  /**
   * User activity: analytics:users:7d or analytics:users:30d
   */
  users: (days: number = 7): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.USERS)
      .identifier(`${days}d`)
      .build(),

  /**
   * Activity data: analytics:activity:7d or analytics:activity:30d
   */
  activity: (days: number = 7): string =>
    new CacheKeyBuilder(CacheNamespace.ANALYTICS)
      .entity(AnalyticsEntityType.ACTIVITY)
      .identifier(`${days}d`)
      .build(),
};

/**
 * Pre-built key generators for views
 */
export const ViewsCacheKeys = {
  /**
   * Confession views: views:confession:uuid
   */
  confession: (confessionId: string): string =>
    new CacheKeyBuilder(CacheNamespace.VIEWS)
      .entity('confession')
      .identifier(confessionId)
      .build(),

  /**
   * User profile views: views:user:uuid
   */
  user: (userId: string): string =>
    new CacheKeyBuilder(CacheNamespace.VIEWS)
      .entity('user')
      .identifier(userId)
      .build(),
};

/**
 * Pre-built key generators for user
 */
export const UserCacheKeys = {
  /**
   * User profile: user:profile:uuid
   */
  profile: (userId: string): string =>
    new CacheKeyBuilder(CacheNamespace.USER)
      .entity(UserEntityType.PROFILE)
      .identifier(userId)
      .build(),

  /**
   * User settings: user:settings:uuid
   */
  settings: (userId: string): string =>
    new CacheKeyBuilder(CacheNamespace.USER)
      .entity(UserEntityType.SETTINGS)
      .identifier(userId)
      .build(),
};

/**
 * Invalidation prefix builders (for segment-based invalidation)
 */
export const InvalidationPrefixes = {
  analyticsTrending: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.TRENDING}`,
  analyticsStats: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.STATS}`,
  analyticsReactions: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.REACTIONS}`,
  analyticsGrowth: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.GROWTH}`,
  analyticsUsers: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.USERS}`,
  analyticsActivity: `${CacheNamespace.ANALYTICS}:${AnalyticsEntityType.ACTIVITY}`,
  viewsConfession: `${CacheNamespace.VIEWS}:confession`,
  viewsUser: `${CacheNamespace.VIEWS}:user`,
  userProfile: `${CacheNamespace.USER}:${UserEntityType.PROFILE}`,
};
