/**
 * ActivityPanel.tsx
 * Issue #199 – Render canonical pending/confirmed/failed anchor and tip states
 */

"use client";

import { ActivityItem, useActivityStore } from "@/store/activityStore";
import React, { useEffect } from "react";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending…",
  stale_pending: "Awaiting confirmation…",
  confirmed: "Confirmed ✓",
  failed: "Failed",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "activity-item--pending",
  stale_pending: "activity-item--stale",
  confirmed: "activity-item--confirmed",
  failed: "activity-item--failed",
};

function resolvedStatus(item: ActivityItem) {
  // Issue #199 – canonical status wins; fall back to optimistic only while null
  return item.canonicalStatus ?? item.localStatus;
}

export function ActivityPanel() {
  const { items, reconcilePending } = useActivityStore();

  // Issue #199 – poll backend to converge stale/pending items
  useEffect(() => {
    reconcilePending();
    const interval = setInterval(reconcilePending, 10_000);
    return () => clearInterval(interval);
  }, [reconcilePending]);

  if (items.length === 0) {
    return <p className="activity-panel__empty">No recent activity.</p>;
  }

  return (
    <ul className="activity-panel" aria-label="Recent wallet activity">
      {items.map((item) => {
        const status = resolvedStatus(item);
        return (
          <li
            key={item.id}
            className={`activity-item ${STATUS_CLASS[status] ?? ""}`}
          >
            <span className="activity-item__type">
              {item.type === "anchor" ? "📌 Anchor" : "💸 Tip"}
            </span>
            <span className="activity-item__confession">
              Confession {item.confessionId}
            </span>
            <span className="activity-item__status" aria-live="polite">
              {STATUS_LABELS[status] ?? status}
            </span>
            {item.canonicalStatus === null && (
              <span
                className="activity-item__optimistic"
                aria-label="Unconfirmed"
              >
                (local estimate)
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
