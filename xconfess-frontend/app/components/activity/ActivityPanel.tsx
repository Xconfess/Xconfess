"use client";

import { ExternalLink } from "lucide-react";
import { useActivityStore } from "@/app/lib/store/activity.store";
import type { ChainActivity } from "@/app/lib/types/activity";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";

export default function ActivityPanel() {
  const activities: ChainActivity[] = useActivityStore((s) => s.activities);

  const getStatusClass = (status: ChainActivity["status"]) => {
    switch (status) {
      case "confirmed":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-yellow-600";
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="text-lg font-semibold mb-4">Chain Activity</h2>

      {activities.length === 0 && (
        <p className="text-sm text-gray-500">No activity yet</p>
      )}

      <div className="space-y-3">
        {activities.map((a) => {
          const explorerUrl =
            a.status === "confirmed" && a.txHash
              ? getStellarExplorerUrl(a.txHash)
              : null;

          return (
            <div
              key={a.id}
              className="border p-3 rounded-lg flex justify-between"
            >
              <div>
                <p className="font-medium">{a.type.toUpperCase()}</p>
                <p className="text-sm text-gray-500">
                  Confession: {a.confessionId ?? "N/A"}
                </p>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on Explorer
                  </a>
                )}
              </div>

              <span className={`text-sm ${getStatusClass(a.status)}`}>
                {a.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
