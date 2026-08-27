import { useActivityStore } from "@/app/lib/store/activity.store";
import type { ChainActivity } from "@/app/lib/types/activity"; // <-- correct type

export default function PendingBanner() {
  const activities: ChainActivity[] = useActivityStore((s) => s.activities);

  const pendingCount = activities.filter((a) => a.status === "submitted").length;

  if (pendingCount === 0) return null;

  return (
    <div
      className="bg-yellow-100 text-yellow-800 p-2 text-center text-sm rounded-md"
      role="status"
      aria-live="polite"
      title="Pending blockchain transactions"
    >
      {pendingCount} transaction{pendingCount > 1 ? "s" : ""} pending...
    </div>
  );
}