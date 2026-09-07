const { evaluateBaselineDecision } = require('../render-prestart');

/**
 * Coverage for the render:prestart baseline decision logic (#1727).
 * The script protects sync-created Render databases, so the rules are:
 *   - never baseline a fresh database
 *   - never duplicate rows into an existing migration history
 *   - baseline only when core tables exist and history is empty
 */
describe('render:prestart baseline decision (#1727)', () => {
  const base = {
    baselineEnabled: true,
    migrationsRunEnabled: true,
    migrationsAvailable: true,
    coreTablesPresent: true,
    migrationHistoryCount: 0,
  };

  it('skips when the baseline feature flag is disabled', () => {
    const decision = evaluateBaselineDecision({ ...base, baselineEnabled: false });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toMatch(/TYPEORM_BASELINE_EXISTING_SCHEMA/);
  });

  it('skips when migrations are not configured to run', () => {
    const decision = evaluateBaselineDecision({ ...base, migrationsRunEnabled: false });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toMatch(/TYPEORM_MIGRATIONS_RUN/);
  });

  it('errors when no compiled migrations are present (build did not run)', () => {
    const decision = evaluateBaselineDecision({ ...base, migrationsAvailable: false });
    expect(decision.action).toBe('error');
    expect(decision.reason).toMatch(/Build must run/);
  });

  it('does not baseline a fresh database (core tables missing)', () => {
    const decision = evaluateBaselineDecision({ ...base, coreTablesPresent: false });
    expect(decision.action).toBe('skip');
    expect(decision.action).not.toBe('baseline');
    expect(decision.reason).toMatch(/pre-synchronized/);
  });

  it('does not duplicate rows when migration history already exists', () => {
    const decision = evaluateBaselineDecision({ ...base, migrationHistoryCount: 12 });
    expect(decision.action).toBe('skip');
    expect(decision.action).not.toBe('baseline');
    expect(decision.reason).toMatch(/already has entries/);
  });

  it('baselines only when core tables exist and migration history is empty', () => {
    const decision = evaluateBaselineDecision(base);
    expect(decision.action).toBe('baseline');
  });

  it('treats a stringified count from pg (SELECT COUNT(*)) as populated history', () => {
    const decision = evaluateBaselineDecision({ ...base, migrationHistoryCount: '3' });
    expect(decision.action).toBe('skip');
  });
});
