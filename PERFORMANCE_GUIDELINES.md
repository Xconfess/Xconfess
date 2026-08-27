# Performance Optimization Guidelines

## Quick Reference

This guide provides best practices for maintaining the performance improvements achieved in Issue #137.

## Backend Guidelines

### Database Queries

**DO:**
- Use indexes for frequently queried columns
- Use eager loading with `leftJoinAndSelect()` for relations
- Select only required fields with `.select()`
- Use query builders for complex queries
- Implement pagination for all list endpoints

**DON'T:**
- Load unnecessary relations
- Use SELECT * in production
- Create N+1 queries
- Skip WHERE clauses on large tables

### Caching Strategy

**Pattern:**
```typescript
// 1. Check cache
const cached = await this.cacheService.get(key);
if (cached) return cached;

// 2. Fetch from database
const data = await this.repository.find(...);

// 3. Cache result
await this.cacheService.set(key, data, ttl);

return data;
```

**TTL Guidelines:**
- Static data: 1 hour (3600s)
- User-specific: 15 minutes (900s)
- Lists: 5 minutes (300s)
- Real-time: 1 minute (60s)

**Cache Invalidation:**
```typescript
// Invalidate specific patterns
await this.cacheService.delPattern('confessions:');

// NEVER use reset() in production
// await this.cacheService.reset(); // ❌ DON'T
```

### API Response Optimization

**Compression:** Automatically enabled for responses > 1KB

**Field Selection:**
```typescript
// Good: Select only needed fields
.select(['id', 'message', 'createdAt'])

// Bad: Load everything
.find() // Returns all fields
```

## Frontend Guidelines

### Code Splitting

**Dynamic Imports:**
```typescript
// Heavy components
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false // if not needed on server
});
```

**When to use:**
- Charts and visualizations
- Admin panels
- Third-party libraries (Stellar SDK)
- Modal content

### React Performance

**Memoization:**
```typescript
// Always add comparison function
const MyComponent = memo(({ data }) => {
  return <div>{data.name}</div>;
}, (prev, next) => {
  return prev.data.id === next.data.id;
});
```

**Hooks:**
```typescript
// useMemo for expensive calculations
const total = useMemo(() => {
  return items.reduce((sum, item) => sum + item.value, 0);
}, [items]);

// useCallback for functions passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

### Image Optimization

**Always use Next.js Image:**
```typescript
<Image
  src={url}
  alt="Description"
  width={400}
  height={300}
  loading="lazy"
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

**Image CDN (if using Cloudinary):**
```typescript
import { optimizeImageUrl } from '@/lib/performance-utils';

const optimizedUrl = optimizeImageUrl(originalUrl, 800);
```

### API Calls

**Debouncing:**
```typescript
import { useDebounce } from '@/lib/hooks/useDebounce';

const [query, setQuery] = useState('');
const debouncedQuery = useDebounce(query, 300);

useEffect(() => {
  if (debouncedQuery) {
    fetchResults(debouncedQuery);
  }
}, [debouncedQuery]);
```

**Request Deduplication:**
React Query automatically deduplicates requests.

## Database Guidelines

### Index Maintenance

**Review indexes quarterly:**
```sql
-- Find unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find missing indexes (high seq scans)
SELECT schemaname, tablename, seq_scan, seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_tup_read DESC;
```

### Query Optimization Checklist

- [ ] Query uses indexes (check with EXPLAIN ANALYZE)
- [ ] No N+1 queries (use eager loading)
- [ ] Proper pagination implemented
- [ ] Only necessary fields selected
- [ ] WHERE clauses on indexed columns
- [ ] JOIN conditions on indexed columns

## Monitoring

### Backend Metrics to Watch

**Response Times:**
- P50: < 100ms
- P95: < 200ms
- P99: < 500ms

**Database:**
- Query time: < 100ms avg
- Connection pool: 5-20 connections
- Cache hit rate: > 75%

**Alerts:**
- API response > 300ms
- Database query > 150ms
- Cache hit rate < 70%
- Connection pool exhausted

### Frontend Metrics to Watch

**Core Web Vitals:**
- LCP: < 2.5s (Good)
- FID: < 100ms (Good)
- CLS: < 0.1 (Good)

**Custom Metrics:**
- Initial bundle: < 200KB
- TTI: < 3s
- Route transition: < 300ms

## Performance Budget

### Backend Budget

| Resource | Limit | Alert At |
|----------|-------|----------|
| API Response | 200ms | 300ms |
| Database Query | 100ms | 150ms |
| Cache Hit Rate | > 75% | < 70% |

### Frontend Budget

| Resource | Limit | Alert At |
|----------|-------|----------|
| Initial JS | 200KB | 250KB |
| Page Load | 2s | 2.5s |
| LCP | 2.5s | 3s |
| CLS | 0.1 | 0.15 |

## Common Pitfalls

### Backend

1. **Forgetting to invalidate cache**
   - Always invalidate after mutations
   - Use pattern-based keys

2. **Loading too much data**
   - Use field selection
   - Implement pagination

3. **Blocking operations**
   - Use async/await properly
   - Don't block event loop

### Frontend

1. **Over-memoization**
   - Only memo components that re-render often
   - Don't memo simple components

2. **Missing dependencies**
   - Always include all dependencies in useEffect
   - Check console warnings

3. **Premature optimization**
   - Measure first
   - Profile before optimizing

## Testing Performance

### Backend Testing

```bash
# Load testing
npm run test:load

# Query analysis
npm run db:analyze

# Cache metrics
npm run cache:stats
```

### Frontend Testing

```bash
# Lighthouse
npm run lighthouse

# Bundle analysis
ANALYZE=true npm run build

# Performance tests
npm run test:performance
```

## Resources

- [Next.js Performance Docs](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
- [Web Vitals](https://web.dev/vitals/)

---

**Remember:** Measure first, optimize second. Don't optimize without data!
