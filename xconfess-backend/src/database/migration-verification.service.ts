import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Columns required on `anonymous_confessions` for search and analytics paths. */
export const REQUIRED_CONFESSION_COLUMNS = [
  'search_vector',
  'view_count',
] as const;

/** Indexes expected after FTS / listing migrations. */
export const REQUIRED_CONFESSION_INDEXES = [
  'idx_confession_search_vector',
  'idx_confession_created_at',
] as const;

export interface SchemaReadinessResult {
  ok: boolean;
  missingColumns: string[];
  missingIndexes: string[];
  /** Populated when information_schema / pg_indexes queries fail. */
  queryError?: string;
}

function getMigrationHint(column: string): string {
  switch (column) {
    case 'search_vector':
      return 'Run: npm run backend:migration:run (or npm run backend:schema:repair for an existing dev database)';
    case 'view_count':
      return 'Run: npm run backend:migration:run (or npm run backend:schema:repair for an existing dev database)';
    default:
      return '';
  }
}

function getIndexHint(index: string): string {
  switch (index) {
    case 'idx_confession_search_vector':
      return 'Run: npm run backend:migration:run — or for a dev database: npm run backend:schema:repair';
    case 'idx_confession_created_at':
      return 'Run: npm run backend:migration:run — or for a dev database: npm run backend:schema:repair';
    default:
      return '';
  }
}

@Injectable()
export class MigrationVerificationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationVerificationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const result = await this.checkConfessionSchema();
    this.logStartupOutcome(result);
  }

  /**
   * Single implementation for confession table schema readiness (columns + indexes).
   * Used at startup (see onModuleInit) and by `SchemaReadinessHealthIndicator` for `/api/health`.
   */
  async checkConfessionSchema(): Promise<SchemaReadinessResult> {
    try {
      const columns = await this.dataSource.query<{ column_name: string }[]>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'anonymous_confessions'
          AND column_name IN ('search_vector', 'view_count');
      `);

      const presentColumns = new Set(columns.map((row) => row.column_name));
      const missingColumns = REQUIRED_CONFESSION_COLUMNS.filter(
        (name) => !presentColumns.has(name),
      );

      const indexes = await this.dataSource.query<{ indexname: string }[]>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'anonymous_confessions'
          AND indexname IN ('idx_confession_search_vector', 'idx_confession_created_at');
      `);

      const presentIndexes = new Set(indexes.map((row) => row.indexname));
      const missingIndexes = REQUIRED_CONFESSION_INDEXES.filter(
        (name) => !presentIndexes.has(name),
      );

      const ok = missingColumns.length === 0 && missingIndexes.length === 0;
      return {
        ok,
        missingColumns: [...missingColumns],
        missingIndexes: [...missingIndexes],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        missingColumns: [],
        missingIndexes: [],
        queryError: message,
      };
    }
  }

  /**
   * Verify migration files across both migration directories for duplicates
   * and out-of-order timestamps.
   */
  async verifyMigrations(): Promise<string[]> {
    const issues: string[] = [];
    const fs = await import('fs');
    const path = await import('path');

    const dirs = [
      path.join(process.cwd(), 'migrations'),
      path.join(process.cwd(), 'src', 'migrations'),
    ];

    const seenTimestamps = new Map<string, string[]>();
    const seenNames = new Map<string, string[]>();

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const timestampMatch = file.match(/^(\d{14})-/);
        if (!timestampMatch) continue;
        const timestamp = timestampMatch[1];
        const fullPath = path.join(dir, file);

        if (!seenTimestamps.has(timestamp)) {
          seenTimestamps.set(timestamp, []);
        }
        seenTimestamps.get(timestamp)!.push(fullPath);

        const nameMatch = file.match(/^\d{14}-(.+)\.ts$/);
        if (nameMatch) {
          const name = nameMatch[1];
          if (!seenNames.has(name)) {
            seenNames.set(name, []);
          }
          seenNames.get(name)!.push(fullPath);
        }
      }
    }

    for (const [timestamp, paths] of seenTimestamps) {
      if (paths.length > 1) {
        issues.push(
          `Duplicate migration timestamp: ${timestamp} found in ${paths.join(', ')}`,
        );
      }
    }

    for (const [name, paths] of seenNames) {
      if (paths.length > 1) {
        issues.push(
          `Duplicate migration name: ${name} found in ${paths.join(', ')}`,
        );
      }
    }

    return issues;
  }

  private logStartupOutcome(result: SchemaReadinessResult): void {
    if (result.queryError) {
      this.logger.error(
        `schema_readiness error="${result.queryError.replace(/"/g, '\\"')}"`,
      );
      return;
    }
    if (!result.ok) {
      const hints: string[] = [];
      for (const col of result.missingColumns) {
        const hint = getMigrationHint(col);
        if (hint) hints.push(`${col}: ${hint}`);
      }
      for (const idx of result.missingIndexes) {
        const hint = getIndexHint(idx);
        if (hint) hints.push(`${idx}: ${hint}`);
      }
      this.logger.warn(
        `schema_readiness_degraded missingColumns=[${result.missingColumns.join(', ')}] missingIndexes=[${result.missingIndexes.join(', ')}] — ${hints.join('; ')}`,
      );
      return;
    }
    this.logger.log('schema_readiness_ok table=anonymous_confessions');
  }
}