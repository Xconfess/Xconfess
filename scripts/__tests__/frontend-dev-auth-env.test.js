const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const {
  assertDevAuthDisabledInProduction,
} = require('../../xconfess-frontend/dev-auth-env');

const ROOT = path.resolve(__dirname, '../..');
const NEXT_CONFIG_URL = pathToFileURL(
  path.join(ROOT, 'xconfess-frontend/next.config.mjs'),
).href;

function loadNextConfig(env) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import(${JSON.stringify(NEXT_CONFIG_URL)})`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NEXT_PUBLIC_DEV_BYPASS_AUTH: '',
        NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN: '',
        ...env,
      },
      encoding: 'utf8',
    },
  );
}

for (const flag of [
  'NEXT_PUBLIC_DEV_BYPASS_AUTH',
  'NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN',
]) {
  test(`rejects ${flag} when enabled in production`, () => {
    assert.throws(
      () =>
        assertDevAuthDisabledInProduction({
          NODE_ENV: 'production',
          [flag]: 'true',
        }),
      new RegExp(flag),
    );

    const result = loadNextConfig({ NODE_ENV: 'production', [flag]: 'true' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(flag));
  });
}

test('rejects both development authentication flags in production', () => {
  const flags = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_DEV_BYPASS_AUTH: 'true',
    NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN: 'true',
  };

  assert.throws(
    () => assertDevAuthDisabledInProduction(flags),
    /NEXT_PUBLIC_DEV_BYPASS_AUTH, NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN/,
  );
  assert.notEqual(loadNextConfig(flags).status, 0);
});

test('allows disabled or unset development authentication flags in production', () => {
  assert.doesNotThrow(() =>
    assertDevAuthDisabledInProduction({
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_BYPASS_AUTH: 'false',
      NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN: '',
    }),
  );

  const result = loadNextConfig({ NODE_ENV: 'production' });
  assert.equal(result.status, 0, result.stderr);
});

for (const nodeEnv of ['development', 'test']) {
  test(`allows the flags in ${nodeEnv}`, () => {
    assert.doesNotThrow(() =>
      assertDevAuthDisabledInProduction({
        NODE_ENV: nodeEnv,
        NEXT_PUBLIC_DEV_BYPASS_AUTH: 'true',
        NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN: 'true',
      }),
    );
  });
}
