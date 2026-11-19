import { DataSource } from 'typeorm';
import { DbPoolSnapshot } from '../observability/operational-metrics.service';

/** The subset of a `pg` Pool that the metrics read. */
interface PgPoolLike {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  options?: { max?: number };
}

/** The pool fields the TypeORM PostgreSQL driver keeps on itself. */
interface PostgresDriverPools {
  master?: PgPoolLike;
  slaves?: PgPoolLike[];
}

function toSnapshot(pool: string, source: PgPoolLike): DbPoolSnapshot {
  return {
    pool,
    total: source.totalCount ?? 0,
    idle: source.idleCount ?? 0,
    waiting: source.waitingCount ?? 0,
    max: source.options?.max ?? 0,
  };
}

/**
 * Read live connection-pool counters from the TypeORM PostgreSQL driver.
 *
 * The write pool is reported as `primary` and every read replica as
 * `replica`. Returns an empty list when the driver exposes no pools.
 */
export function readDbPoolStats(dataSource: DataSource): DbPoolSnapshot[] {
  const driver = (dataSource?.driver ?? {}) as PostgresDriverPools;
  const snapshots: DbPoolSnapshot[] = [];
  if (driver.master) {
    snapshots.push(toSnapshot('primary', driver.master));
  }
  for (const replica of driver.slaves ?? []) {
    snapshots.push(toSnapshot('replica', replica));
  }
  return snapshots;
}
