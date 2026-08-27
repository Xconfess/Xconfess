export type ActivityStatus =
  | "requested"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

export type ActivityType = "anchor" | "tip";

export interface ChainActivity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  txHash?: string;
  createdAt: number;
  updatedAt?: number;

  // context
  confessionId?: string;
  amount?: number;
}