const NETWORK_CONFIG = {
  testnet: {
    horizonHost: 'horizon-testnet.stellar.org',
    sorobanRpcHost: 'soroban-rpc-testnet.stellar.org',
  },
  mainnet: {
    horizonHost: 'horizon.stellar.org',
    sorobanRpcHost: 'soroban-rpc.mainnet.stellar.org',
  },
};

function validateNetworkConfiguration({ network, horizonUrl, sorobanRpcUrl, deploymentNetwork }) {
  const failures = [];
  const selected = String(network || '').toLowerCase();
  const expected = NETWORK_CONFIG[selected];

  if (!expected) {
    failures.push(`STELLAR_NETWORK must be one of ${Object.keys(NETWORK_CONFIG).join(', ')}.`);
    return failures;
  }
  if (deploymentNetwork && selected !== String(deploymentNetwork).toLowerCase()) {
    failures.push(`STELLAR_NETWORK (${network}) does not match deployment metadata network (${deploymentNetwork}).`);
  }

  for (const [label, value, expectedHost] of [
    ['STELLAR_HORIZON_URL', horizonUrl, expected.horizonHost],
    ['STELLAR_SOROBAN_RPC_URL', sorobanRpcUrl, expected.sorobanRpcHost],
  ]) {
    if (!value) continue;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      failures.push(`${label} must be an absolute http(s) URL.`);
      continue;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      failures.push(`${label} must use http or https.`);
    }
    if (parsed.hostname !== expectedHost) {
      failures.push(`${label} (${value}) is for ${parsed.hostname}, not ${selected} (${expectedHost}).`);
    }
  }

  return failures;
}

module.exports = { NETWORK_CONFIG, validateNetworkConfiguration };
