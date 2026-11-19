const DEV_AUTH_FLAGS = [
  'NEXT_PUBLIC_DEV_BYPASS_AUTH',
  'NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN',
];

function assertDevAuthDisabledInProduction(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const enabledFlags = DEV_AUTH_FLAGS.filter((name) => env[name] === 'true');
  if (enabledFlags.length > 0) {
    throw new Error(
      `Development authentication flags are not allowed in production: ${enabledFlags.join(', ')}`,
    );
  }
}

module.exports = { assertDevAuthDisabledInProduction };
