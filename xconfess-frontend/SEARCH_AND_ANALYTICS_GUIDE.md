# Search and Analytics Guide

This document describes the intended behavior of search filters and dashboard metrics for Xconfess, enabling consistent validation and QA testing.

## Table of Contents

1. [Search Behavior](#search-behavior)
2. [Analytics Metrics](#analytics-metrics)
3. [URL State Management](#url-state-management)
4. [Test Case Examples](#test-case-examples)

---

## Search Behavior

### Overview

The search feature allows users to discover confessions based on text queries with optional filters.

### Search Types

#### 1. Full-Text Search
- Uses PostgreSQL `tsvector` and `ts_rank` for relevance scoring
- Falls back to `ILIKE` for partial matches if full-text is unavailable
- Sanitizes input by removing special characters
- Joins terms with AND operator

#### 2. Hybrid Search
- Attempts full-text search first
- Falls back to ILIKE search if no results
- Results are ranked by relevance (full-text) or recency (ILIKE fallback)

### Filter Behavior

| Filter | Type | Default | Description |
|--------|------|---------|-------------|
| `q` | string | required | Search query (min 1 char) |
| `sort` | enum | `newest` | Sort order: `newest`, `oldest`, `reactions` |
| `gender` | enum | all | Filter by gender: `male`, `female`, `other` |
| `page` | number | 1 | Pagination page number |
| `limit` | number | 10 | Results per page (max 100) |

### Sort Behavior

| Sort Option | Behavior |
|-------------|----------|
| `newest` | Orders by `created_at DESC` (most recent first) |
| `oldest` | Orders by `created_at ASC` (oldest first) |
| `reactions` | Orders by reaction count descending, then by `created_at DESC` |

### Fallback Rules

1. **Empty query**: Returns 400 Bad Request
2. **No results**: Returns empty array with `total: 0`
3. **Invalid page**: Defaults to page 1
4. **Limit out of range**: Clamps to 1-100

### URL State

Search state should be persisted in URL query parameters:
```
/search?q=keyword&sort=reactions&gender=female&page=2
```

---

## Analytics Metrics

### Overview

The analytics dashboard provides insights into platform activity and confession performance.

### Metric Definitions

#### 1. Trending Confessions
```typescript
interface TrendingConfession {
  id: string;
  content: string;
  createdAt: string;
  reactionCount: number;
  reactions: { like: number; love: number };
}
```

**Scoring Algorithm**:
```
trending_score = view_count + (3 * recent_reactions) + (10 / (1 + hours_since_created))
```
- `recent_reactions`: Reactions in the last 24 hours only
- Weight favors recent activity over historical popularity

#### 2. Reaction Distribution
```typescript
interface ReactionDistribution {
  type: string;      // e.g., "like", "love"
  count: number;      // Total count of this reaction type
  percentage: number;  // Percentage of total reactions
}
```

**Calculation**: `percentage = (count / total_reactions) * 100`

#### 3. Daily Activity
```typescript
interface DailyActivity {
  date: string;        // ISO date string (YYYY-MM-DD)
  confessions: number; // New confessions on this date
  reactions: number;    // Total reactions on this date
  activeUsers: number; // Users who performed any action
}
```

#### 4. Total Metrics
```typescript
interface TotalMetrics {
  totalConfessions: number; // All-time confession count
  totalReactions: number;    // All-time reaction count
  totalUsers: number;       // All-time registered user count
}
```

### Comparison Windows

| Period | Description |
|--------|-------------|
| `7days` | Last 7 days from current date |
| `30days` | Last 30 days from current date |

### Known Caveats

1. **Reaction Distribution**: Percentages are rounded to 2 decimal places
2. **Daily Activity**: Dates use UTC timezone
3. **Trending**: Confessions must be approved/non-hidden to appear
4. **User Count**: Includes both active and inactive accounts

---

## URL State Management

### Search State

All search filters should be reflected in URL:
- Supports deep linking and browser back/forward
- Initial page load should parse URL params
- Client-side state should sync with URL on filter change

### Analytics State

- Period selection (`7days`/`30days`) stored in URL: `/analytics?period=30days`
- Date range overrides period when both provided

---

## Test Case Examples

### Search Tests

#### Valid Search
```typescript
// GET /api/confessions/search?q=test&sort=reactions&page=1&limit=10
expect(response.status).toBe(200);
expect(response.body.data).toBeInstanceOf(Array);
expect(response.body.meta.total).toBeGreaterThanOrEqual(0);
```

#### Empty Query
```typescript
// GET /api/confessions/search?q=
expect(response.status).toBe(400);
expect(response.body.message).toContain('empty');
```

#### Sort Options
```typescript
// Verify each sort option produces different ordering
const newest = await search({ sort: 'newest' });
const oldest = await search({ sort: 'oldest' });
const byReactions = await search({ sort: 'reactions' });

expect(newest.data[0].id).not.toBe(oldest.data[0].id);
```

### Analytics Tests

#### Trending Score
```typescript
// A confession with 100 views and 10 recent reactions should rank higher
// than one with 100 views but 0 recent reactions
const trending = response.body.trending;
expect(trending[0].reactionCount).toBeGreaterThanOrEqual(trending[1].reactionCount);
```

#### Reaction Distribution
```typescript
const distribution = response.body.reactionDistribution;
const total = distribution.reduce((sum, r) => sum + r.count, 0);
const percentages = distribution.map(r => r.percentage);

expect(percentages.reduce((sum, p) => sum + p, 0)).toBeCloseTo(100, 0);
```

#### Date Range
```typescript
// Verify only dates within range are returned
const { dailyActivity } = response.body;
dailyActivity.forEach(day => {
  const date = new Date(day.date);
  expect(date >= startDate && date <= endDate).toBe(true);
});
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Search with special characters | Sanitized, special chars removed |
| Very long search query | Truncated or limited to max length |
| Page beyond results | Returns empty array |
| Negative page/limit | Defaults to page 1, limit 10 |
| Missing date range on analytics | Defaults to 30 days |

---

## Related Documentation

- [Complete System Overview](../COMPLETE_SYSTEM_OVERVIEW.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)
- Backend issue: `164-feat-backend-rolling-window-analytics-comparisons`
