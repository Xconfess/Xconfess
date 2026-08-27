/**
 * activityStore.ts
 * Issue #199 – Reconcile activity UI with canonical backend anchor/tip state
 * Uses Zustand-style store (adapt to your actual store library)
 */

import { fetchTipStatus, TipStatus } from "@/lib/services/tipping.service";
import { create } from "zustand";

export type AnchorStatus = "pending" | "confirmed" | "failed" | "stale_pending";

export interface ActivityItem {
  id: string;
  type: "anchor" | "tip";
  confessionId: string;
  /** Optimistic local status – used as bridge until backend confirms */
  localStatus: TipStatus | AnchorStatus;
  /** Canonical status returned by backend; null until first reconciliation */
  canonicalStatus: TipStatus | AnchorStatus | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityState {
  items: ActivityItem[];
  addOptimistic: (item: Omit<ActivityItem, "canonicalStatus">) => void;
  reconcile: (id: string, canonicalStatus: TipStatus | AnchorStatus) => void;
  /** Poll backend for canonical status of all pending items */
  reconcilePending: () => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  items: [],

  addOptimistic: (item) => {
    set((s) => ({
      items: [...s.items, { ...item, canonicalStatus: null }],
    }));
  },

  reconcile: (id, canonicalStatus) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id
          ? { ...item, canonicalStatus, updatedAt: new Date().toISOString() }
          : item,
      ),
    }));
  },

  reconcilePending: async () => {
    const pending = get().items.filter(
      (i) =>
        i.canonicalStatus === null ||
        i.canonicalStatus === "pending" ||
        i.canonicalStatus === "stale_pending",
    );

    await Promise.allSettled(
      pending.map(async (item) => {
        try {
          if (item.type === "tip") {
            const result = await fetchTipStatus(item.id);
            get().reconcile(item.id, result.status);
          }
          // Anchor reconciliation can be added here similarly
        } catch {
          // Reconciliation failure: leave item as-is, will retry next poll
        }
      }),
    );
  },
}));
