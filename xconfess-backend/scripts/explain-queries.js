/* Run EXPLAIN ANALYZE for a set of predefined queries against the configured database.
 * Usage: node scripts/explain-queries.js --query=confession_list --limit=100
 * Requires same env as data-source.ts (.env in backend dir)
 */
const { spawnSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const queries = {
  confession_list: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM anonymous_confessions WHERE is_deleted = false AND is_hidden = false AND moderation_status IN ('approved','pending') ORDER BY created_at DESC LIMIT $1;`,
  confession_by_tag: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT c.id FROM anonymous_confessions c INNER JOIN confession_tags ct ON ct.confession_id = c.id INNER JOIN tags t ON t.id = ct.tag_id WHERE t.name = $1 AND c.is_deleted = false ORDER BY c.created_at DESC LIMIT $2;`,
  reports_list: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT $2;`,
  audit_logs_by_admin_daterange: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM audit_logs WHERE admin_id = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC LIMIT $4;`,
  reports_cursor_by_status: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM reports WHERE status = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC, id DESC LIMIT $4;`,
  search_discovery_fulltext: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM confessions WHERE is_deleted = false AND to_tsvector('english', body) @@ plainto_tsquery('english', $1) AND created_at >= $2 AND created_at <= $3 AND gender = $4 ORDER BY ts_rank(to_tsvector('english', body), plainto_tsquery('english', $1)) DESC LIMIT $5;`,
};

const argv = require('minimist')(process.argv.slice(2));
const q = argv.query || 'confession_list';
if (!queries[q]) {
  console.error('Unknown query key. Options:', Object.keys(queries).join(', '));
  process.exit(2);
}

const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  const client = await pool.connect();
  try {
    let res;
    if (q === 'confession_by_tag') {
      res = await client.query(queries[q], ['test', parseInt(argv.limit || '100', 10)]);
    } else if (q === 'reports_list') {
      res = await client.query(queries[q], ['pending', parseInt(argv.limit || '100', 10)]);
    } else if (q === 'audit_logs_by_admin_daterange') {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      res = await client.query(queries[q], [1, sevenDaysAgo, now, parseInt(argv.limit || '100', 10)]);
    } else if (q === 'reports_cursor_by_status') {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      res = await client.query(queries[q], ['pending', sevenDaysAgo, now, parseInt(argv.limit || '100', 10)]);
    } else if (q === 'search_discovery_fulltext') {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      res = await client.query(queries[q], ['work', sevenDaysAgo, now, 'male', parseInt(argv.limit || '100', 10)]);
    } else {
      res = await client.query(queries[q], [parseInt(argv.limit || '100', 10)]);
    }
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Explain failed:', err.message || err);
  } finally {
    client.release();
    await pool.end();
  }
})();
