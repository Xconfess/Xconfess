import {
  buildDemoRecords,
  stableDemoHex,
  stableDemoUuid,
} from '../../scripts/seed-demo';

describe('Wave 5 demo seed records', () => {
  it('builds deterministic demo records for the local walkthrough', () => {
    const records = buildDemoRecords();

    expect(records.users).toHaveLength(3);
    expect(records.confessions).toHaveLength(3);
    expect(records.reactions).toHaveLength(3);
    expect(records.comments).toHaveLength(3);
    expect(records.tips).toHaveLength(2);
    expect(records.users.map((user) => user.username)).toEqual([
      'wave5_user',
      'wave5_friend',
      'wave5_admin',
    ]);
    expect(new Set(records.users.map((user) => user.email)).size).toBe(3);
    expect(records.tips.every((tip) => /^[a-f0-9]{64}$/.test(tip.txId))).toBe(
      true,
    );
  });

  it('uses stable identifiers for idempotent re-runs', () => {
    expect(stableDemoHex('xconfess-wave5-demo-tip-1')).toBe(
      stableDemoHex('xconfess-wave5-demo-tip-1'),
    );
    expect(stableDemoUuid('anon:regular')).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });
});
