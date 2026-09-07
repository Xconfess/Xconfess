export interface TractionMetrics {
  schemaVersion: 1;
  generatedAt: string;
  users: {
    totalRegistered: number;
    dau: number;
    wau: number;
    mau: number;
  };
  engagement: {
    confessionsCreated: number;
    commentsCreated: number;
    reactionsCreated: number;
    messagesSent: number;
  };
  stellar: {
    network: string;
    walletsConnected: number;
    submittedTransactions: number;
    confirmedTransactions: number;
    failedTransactions: number;
    successfulTips: number;
    tipVolumeByAsset: Record<string, string>;
    sorobanEventsIndexed: number;
    contracts: {
      confessionAnchorContractId: string | null;
      reputationBadgesContractId: string | null;
      tippingSystemContractId: string | null;
    };
  };
  reliability: {
    transactionSuccessRate: number | null;
  };
}

export async function fetchPublicTractionMetrics(): Promise<TractionMetrics> {
  const response = await fetch("/api/public/traction", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Public traction metrics unavailable (${response.status})`);
  }

  return response.json();
}
