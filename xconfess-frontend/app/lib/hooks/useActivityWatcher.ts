"use client";

import { useEffect } from "react";
import { useActivityStore } from "../store/activity.store";
import { checkTransactionStatus } from "@/lib/services/tipping.service";

export const useActivityWatcher = () => {
  const activities = useActivityStore((s) => s.activities);
  const updateActivity = useActivityStore((s) => s.updateActivity);

  useEffect(() => {
    let isMounted = true;

    const checkActivities = async () => {
      for (const activity of activities) {
        if (activity.status !== "submitted" || !activity.txHash) continue;

        try {
          const status = await checkTransactionStatus(activity.txHash);
          if (status !== "submitted" && isMounted) {
            updateActivity(activity.id, { status, updatedAt: Date.now() });
          }
        } catch (err) {
          console.error("Failed to check transaction", err);
        }
      }
    };

    const interval = setInterval(() => {
      checkActivities();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activities, updateActivity]);
};