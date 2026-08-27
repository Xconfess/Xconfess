/**
 * Response shape for GET /api/stellar/config (public deployment summary).
 * Contract ID fields are null when not configured in the backend environment.
 */
export interface StellarContractIds {
  confessionAnchor: string | null;
  reputationBadges: string | null;
  tippingSystem: string | null;
}

export interface DeploymentMetadataStatus {
  loaded: boolean;
  generatedAtUtc: string | null;
  isStale: boolean;
  ageDays: number | null;
  loadError: string | null;
}

export interface StellarConfigResponse {
  network: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  contractIds: StellarContractIds;
  deploymentMetadata: DeploymentMetadataStatus;
}
