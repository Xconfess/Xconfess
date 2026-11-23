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

export interface ForeignKeyReadinessResult {
  ok: boolean;
  missingForeignKeys: string[];
  missingIndexes: string[];
  queryError?: string;
}

interface CatalogForeignKey {
  table_name: string;
  referenced_table: string;
  columns: string[];
  referenced_columns: string[];
  delete_action: string;
  update_action: string;
}

interface CatalogIndex {
  table_name: string;
  columns: string[];
}

const PG_ACTIONS: Record<string, string> = {
  NO_ACTION: 'a',
  RESTRICT: 'r',
  CASCADE: 'c',
  SET_NULL: 'n',
  SET_DEFAULT: 'd',
};

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
    const foreignKeys = await this.checkForeignKeyIntegrity();
    if (foreignKeys.queryError) {
      this.logger.error(
        `foreign_key_readiness error="${foreignKeys.queryError.replace(/"/g, '\\"')}"`,
      );
    } else if (!foreignKeys.ok) {
      this.logger.warn(
        `foreign_key_readiness_degraded missingForeignKeys=[${foreignKeys.missingForeignKeys.join('; ')}] missingIndexes=[${foreignKeys.missingIndexes.join('; ')}]`,
      );
    } else {
      this.logger.log('foreign_key_readiness_ok');
    }
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
   * Compare every owning TypeORM relation with PostgreSQL's live catalog.
   * This runs after migrations at startup and verifies the declared delete /
   * update actions as well as indexes that keep FK checks from scanning a
   * referencing table on every parent update or delete.
   */
  async checkForeignKeyIntegrity(): Promise<ForeignKeyReadinessResult> {
    try {
      const expected = this.dataSource.entityMetadatas.flatMap((entity) =>
        entity.relations.flatMap((relation) => {
          if (!relation.isOwning || relation.joinColumns.length === 0)
            return [];
          return [
            {
              table: entity.tableName,
              referencedTable: relation.inverseEntityMetadata.tableName,
              columns: relation.joinColumns.map(
                (column) => column.databaseName,
              ),
              referencedColumns: relation.joinColumns.map(
                (column) => column.referencedColumn?.databaseName ?? '',
              ),
              deleteAction:
                PG_ACTIONS[
                  (relation.onDelete ?? 'NO_ACTION')
                    .toUpperCase()
                    .replace(' ', '_')
                ] ?? 'a',
              updateAction:
                PG_ACTIONS[
                  (relation.onUpdate ?? 'NO_ACTION')
                    .toUpperCase()
                    .replace(' ', '_')
                ] ?? 'a',
            },
          ];
        }),
      );

      const foreignKeys = await this.dataSource.query<CatalogForeignKey[]>(`
        SELECT child.relname AS table_name,
               parent.relname AS referenced_table,
               array_agg(child_column.attname ORDER BY child_key.ordinality) AS columns,
               array_agg(parent_column.attname ORDER BY parent_key.ordinality) AS referenced_columns,
               constraint_row.confdeltype AS delete_action,
               constraint_row.confupdtype AS update_action
        FROM pg_constraint constraint_row
        JOIN pg_class child ON child.oid = constraint_row.conrelid
        JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
        JOIN pg_class parent ON parent.oid = constraint_row.confrelid
        JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY child_key(attnum, ordinality) ON true
        JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY parent_key(attnum, ordinality)
          ON parent_key.ordinality = child_key.ordinality
        JOIN pg_attribute child_column ON child_column.attrelid = child.oid AND child_column.attnum = child_key.attnum
        JOIN pg_attribute parent_column ON parent_column.attrelid = parent.oid AND parent_column.attnum = parent_key.attnum
        WHERE constraint_row.contype = 'f' AND child_schema.nspname = 'public'
        GROUP BY child.relname, parent.relname, constraint_row.confdeltype, constraint_row.confupdtype;
      `);

      const indexes = await this.dataSource.query<CatalogIndex[]>(`
        SELECT table_row.relname AS table_name,
               array_agg(attribute_row.attname ORDER BY key_column.ordinality) AS columns
        FROM pg_index index_row
        JOIN pg_class table_row ON table_row.oid = index_row.indrelid
        JOIN pg_namespace table_schema ON table_schema.oid = table_row.relnamespace
        JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY key_column(attnum, ordinality)
          ON key_column.ordinality <= index_row.indnkeyatts
        JOIN pg_attribute attribute_row ON attribute_row.attrelid = table_row.oid AND attribute_row.attnum = key_column.attnum
        WHERE table_schema.nspname = 'public' AND index_row.indisvalid AND index_row.indisready
        GROUP BY table_row.relname, index_row.indexrelid;
      `);

      const missingForeignKeys: string[] = [];
      const missingIndexes: string[] = [];
      for (const relation of expected) {
        const label = `${relation.table}(${relation.columns.join(',')}) -> ${relation.referencedTable}(${relation.referencedColumns.join(',')})`;
        const found = foreignKeys.some(
          (actual) =>
            actual.table_name === relation.table &&
            actual.referenced_table === relation.referencedTable &&
            JSON.stringify(actual.columns) ===
              JSON.stringify(relation.columns) &&
            JSON.stringify(actual.referenced_columns) ===
              JSON.stringify(relation.referencedColumns) &&
            actual.delete_action === relation.deleteAction &&
            actual.update_action === relation.updateAction,
        );
        if (!found) missingForeignKeys.push(label);

        const indexed = indexes.some(
          (index) =>
            index.table_name === relation.table &&
            relation.columns.every(
              (column, position) => index.columns[position] === column,
            ),
        );
        if (!indexed)
          missingIndexes.push(
            `${relation.table}(${relation.columns.join(',')})`,
          );
      }

      return {
        ok: missingForeignKeys.length === 0 && missingIndexes.length === 0,
        missingForeignKeys,
        missingIndexes,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        missingForeignKeys: [],
        missingIndexes: [],
        queryError: err instanceof Error ? err.message : String(err),
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
        const fullPath = path.join(dir, file);
        const text = fs.readFileSync(fullPath, 'utf8');
        if (
          text.includes('implements MigrationInterface') &&
          !/\b(?:public\s+)?async\s+down\s*\(/.test(text)
        ) {
          issues.push(`Migration has no rollback method: ${fullPath}`);
        }
        const nameMatch = text.match(
          /name\s*=\s*['"][A-Za-z0-9_]+?(\d{13,14})['"]/,
        );
        const classMatch = text.match(
          /class\s+[A-Za-z0-9_]+?(\d{13,14})\s+implements\s+MigrationInterface/,
        );
        const fileTimestampMatch = file.match(/^(\d{14})-/);
        const rawTimestamp =
          nameMatch?.[1] || classMatch?.[1] || fileTimestampMatch?.[1];
        if (!rawTimestamp) continue;
        const timestamp = rawTimestamp.slice(-13);

        if (!seenTimestamps.has(timestamp)) {
          seenTimestamps.set(timestamp, []);
        }
        seenTimestamps.get(timestamp)!.push(fullPath);

        const filenameNameMatch = file.match(/^\d{14}-(.+)\.ts$/);
        if (filenameNameMatch) {
          const name = filenameNameMatch[1];
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
