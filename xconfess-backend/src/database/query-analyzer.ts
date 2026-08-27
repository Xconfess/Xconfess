import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class QueryAnalyzer {
  private readonly logger = new Logger('QueryAnalyzer');

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async analyzeSlowQueries() {
    try {
      const slowQueries = await this.dataSource.query(`
        SELECT 
          query,
          calls,
          mean_exec_time,
          max_exec_time,
          total_exec_time
        FROM pg_stat_statements
        WHERE mean_exec_time > 100
        ORDER BY mean_exec_time DESC
        LIMIT 20;
      `);

      this.logger.warn('Slow Queries Found:');
      slowQueries.forEach((q) => {
        this.logger.warn(
          `  ${q.mean_exec_time.toFixed(2)}ms avg (${q.calls} calls): ${q.query.substring(0, 100)}...`,
        );
      });

      return slowQueries;
    } catch (error) {
      this.logger.error(
        'pg_stat_statements extension not available. Enable it for query analysis.',
      );
      return [];
    }
  }

  async findMissingIndexes() {
    try {
      const unusedIndexes = await this.dataSource.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
        ORDER BY schemaname, tablename;
      `);

      if (unusedIndexes.length > 0) {
        this.logger.warn('Unused Indexes Found:', unusedIndexes);
      }

      const tableScans = await this.dataSource.query(`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          seq_tup_read / seq_scan as avg_seq_tup
        FROM pg_stat_user_tables
        WHERE seq_scan > 0
        ORDER BY seq_tup_read DESC
        LIMIT 10;
      `);

      this.logger.warn('Tables with high sequential scans:');
      tableScans.forEach((t) => {
        this.logger.warn(
          `  ${t.tablename}: ${t.seq_scan} scans, ${t.seq_tup_read} rows read`,
        );
      });

      return { unusedIndexes, tableScans };
    } catch (error) {
      this.logger.error('Error analyzing indexes:', error.message);
      return { unusedIndexes: [], tableScans: [] };
    }
  }

  async getTableSizes() {
    const sizes = await this.dataSource.query(`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    `);

    this.logger.log('Table sizes:');
    sizes.forEach((s) => {
      this.logger.log(`  ${s.tablename}: ${s.size}`);
    });

    return sizes;
  }
}
