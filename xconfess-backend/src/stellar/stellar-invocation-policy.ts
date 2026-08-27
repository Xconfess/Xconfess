export const STELLAR_INVOKE_SCOPE_LEGACY = 'stellar:invoke-contract';
export const STELLAR_INVOKE_SCOPE_WILDCARD = 'stellar:invoke-contract:*';

export type StellarInvocationAllowlistClass = 'anchoring';
export type StellarInvocationContractName =
  | 'confessionAnchor'
  | 'reputationBadges'
  | 'tippingSystem';

interface StellarInvocationPolicyDefinition {
  allowlistClass: StellarInvocationAllowlistClass;
  contractName: StellarInvocationContractName;
  functionName: string;
  allowedScopes: readonly string[];
  issuedAdminScopes: readonly string[];
}

const STELLAR_INVOCATION_POLICY_DEFINITIONS = {
  anchor_confession: {
    allowlistClass: 'anchoring',
    contractName: 'confessionAnchor',
    functionName: 'anchor_confession',
    allowedScopes: [
      STELLAR_INVOKE_SCOPE_WILDCARD,
      'stellar:invoke-contract:anchoring',
      'stellar:invoke-contract:anchor_confession',
      STELLAR_INVOKE_SCOPE_LEGACY,
    ],
    issuedAdminScopes: [
      'stellar:invoke-contract:anchoring',
      'stellar:invoke-contract:anchor_confession',
    ],
  },
} as const satisfies Record<string, StellarInvocationPolicyDefinition>;

export type StellarInvocationOperation =
  keyof typeof STELLAR_INVOCATION_POLICY_DEFINITIONS;

export interface StellarInvocationPolicy
  extends StellarInvocationPolicyDefinition {
  operation: StellarInvocationOperation;
}

export const STELLAR_INVOKE_ALLOWED_OPERATIONS = Object.freeze(
  Object.keys(
    STELLAR_INVOCATION_POLICY_DEFINITIONS,
  ) as StellarInvocationOperation[],
);

export function getStellarInvocationPolicy(
  operation?: string | null,
): StellarInvocationPolicy | null {
  if (!operation) {
    return null;
  }

  const definition =
    STELLAR_INVOCATION_POLICY_DEFINITIONS[
      operation as StellarInvocationOperation
    ];

  if (!definition) {
    return null;
  }

  return {
    operation: operation as StellarInvocationOperation,
    ...definition,
  };
}

export function hasAnyStellarInvocationScope(
  scopes: readonly string[] | undefined,
): boolean {
  if (!Array.isArray(scopes)) {
    return false;
  }

  return scopes.some(
    (scope) =>
      scope === STELLAR_INVOKE_SCOPE_LEGACY ||
      scope === STELLAR_INVOKE_SCOPE_WILDCARD ||
      scope.startsWith(`${STELLAR_INVOKE_SCOPE_LEGACY}:`),
  );
}

export function getMatchingStellarInvocationScope(
  operation: string | undefined | null,
  scopes: readonly string[] | undefined,
): string | null {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return null;
  }

  const policy = getStellarInvocationPolicy(operation);
  if (policy) {
    return policy.allowedScopes.find((scope) => scopes.includes(scope)) ?? null;
  }

  return (
    scopes.find(
      (scope) =>
        scope === STELLAR_INVOKE_SCOPE_LEGACY ||
        scope === STELLAR_INVOKE_SCOPE_WILDCARD ||
        scope.startsWith(`${STELLAR_INVOKE_SCOPE_LEGACY}:`),
    ) ?? null
  );
}

export function getDefaultAdminStellarInvocationScopes(): string[] {
  const scopes = new Set<string>();

  for (const definition of Object.values(
    STELLAR_INVOCATION_POLICY_DEFINITIONS,
  )) {
    definition.issuedAdminScopes.forEach((scope) => scopes.add(scope));
  }

  return [...scopes];
}
