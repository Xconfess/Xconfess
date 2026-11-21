/**
 * Startup validation of Stellar contract / network configuration (Issue #2280).
 *
 * Runs as part of `envValidationSchema` when `STELLAR_FEATURES_ENABLED=true`,
 * so a misconfigured deployment fails before boot instead of talking to the
 * wrong network. Diagnostics name variables and URL hosts only: contract ID
 * values, URL paths/query strings (which may carry API keys) and secrets are
 * never echoed.
 */

export const STELLAR_CONTRACT_ID_VARS = [
  'CONFESSION_ANCHOR_CONTRACT_ID',
  'REPUTATION_BADGES_CONTRACT_ID',
  'TIPPING_SYSTEM_CONTRACT_ID',
] as const;

export const STELLAR_ENDPOINT_VARS = ['STELLAR_HORIZON_URL', 'STELLAR_SOROBAN_RPC_URL'] as const;

/** Soroban contract strkey: "C" followed by 55 base32 characters. */
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

type EndpointNetwork = 'testnet' | 'mainnet' | 'futurenet';

const KNOWN_MAINNET_HOSTS = new Set([
  'horizon.stellar.org',
  'soroban-rpc.stellar.org',
  'mainnet.sorobanrpc.com',
]);

/**
 * Infer which Stellar network an endpoint serves from its hostname.
 * Returns `null` for hosts that cannot be classified (custom providers,
 * localhost), which are not checked.
 */
export function inferEndpointNetwork(url: string): EndpointNetwork | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('futurenet')) return 'futurenet';
  if (host.includes('testnet')) return 'testnet';
  if (KNOWN_MAINNET_HOSTS.has(host) || host.includes('mainnet') || host.includes('pubnet')) {
    return 'mainnet';
  }
  return null;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '<unparseable>';
  }
}

/**
 * Return actionable, non-secret diagnostics for contract/network
 * misconfiguration. An empty array means the configuration is consistent.
 */
export function findStellarNetworkConfigIssues(env: Record<string, unknown>): string[] {
  if (env.STELLAR_FEATURES_ENABLED !== 'true') {
    return [];
  }

  const issues: string[] = [];
  const network = String(env.STELLAR_NETWORK ?? 'testnet');

  for (const name of STELLAR_CONTRACT_ID_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value !== '' && !CONTRACT_ID_PATTERN.test(value)) {
      issues.push(
        `${name} is not a valid Soroban contract ID (expected 56 characters starting with "C"). Copy the ID from the ${network} deployment output.`,
      );
    }
  }

  const seen = new Map<string, string>();
  for (const name of STELLAR_CONTRACT_ID_VARS) {
    const value = env[name];
    if (typeof value !== 'string' || value === '') continue;
    const previous = seen.get(value);
    if (previous) {
      issues.push(
        `${previous} and ${name} are set to the same contract ID. Each contract must have its own ID for the ${network} network.`,
      );
    } else {
      seen.set(value, name);
    }
  }

  for (const name of STELLAR_ENDPOINT_VARS) {
    const value = env[name];
    if (typeof value !== 'string' || value === '') continue;
    const endpointNetwork = inferEndpointNetwork(value);
    if (endpointNetwork && endpointNetwork !== network) {
      issues.push(
        `${name} points to a ${endpointNetwork} endpoint (host "${safeHost(value)}") but STELLAR_NETWORK is "${network}". Set ${name} to a ${network} endpoint or change STELLAR_NETWORK.`,
      );
    }
  }

  return issues;
}
