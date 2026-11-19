import { DataSource } from 'typeorm';
import { readDbPoolStats } from './db-pool-stats';

function dataSourceWithDriver(driver: object): DataSource {
  return { driver } as unknown as DataSource;
}

describe('readDbPoolStats', () => {
  it('reports the write pool as primary with its counts and max', () => {
    const master = {
      totalCount: 5,
      idleCount: 2,
      waitingCount: 1,
      options: { max: 20 },
    };

    expect(
      readDbPoolStats(dataSourceWithDriver({ master, slaves: [] })),
    ).toEqual([{ pool: 'primary', total: 5, idle: 2, waiting: 1, max: 20 }]);
  });

  it('reports each read replica as a replica snapshot', () => {
    const replicaA = {
      totalCount: 3,
      idleCount: 3,
      waitingCount: 0,
      options: { max: 10 },
    };
    const replicaB = {
      totalCount: 4,
      idleCount: 1,
      waitingCount: 2,
      options: { max: 10 },
    };

    expect(
      readDbPoolStats(
        dataSourceWithDriver({ master: {}, slaves: [replicaA, replicaB] }),
      ),
    ).toEqual([
      { pool: 'primary', total: 0, idle: 0, waiting: 0, max: 0 },
      { pool: 'replica', total: 3, idle: 3, waiting: 0, max: 10 },
      { pool: 'replica', total: 4, idle: 1, waiting: 2, max: 10 },
    ]);
  });

  it('defaults missing counters to zero', () => {
    expect(readDbPoolStats(dataSourceWithDriver({ master: {} }))).toEqual([
      { pool: 'primary', total: 0, idle: 0, waiting: 0, max: 0 },
    ]);
  });

  it('returns an empty list when the driver exposes no pools', () => {
    expect(readDbPoolStats(dataSourceWithDriver({}))).toEqual([]);
  });

  it('returns an empty list when the data source has no driver', () => {
    expect(readDbPoolStats({} as DataSource)).toEqual([]);
  });
});
