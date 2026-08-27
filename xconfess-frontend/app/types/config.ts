export interface DeploymentConfig {
  stellarNetwork: string | undefined;
  contractId: string | undefined;
  rpcEndpoint: string | undefined;
}

export const getDeploymentConfig = (): DeploymentConfig => {
  return {
    stellarNetwork: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    contractId: process.env.NEXT_PUBLIC_CONTRACT_ID,
    rpcEndpoint: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
  };
};