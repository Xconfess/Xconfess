import { useState, useEffect } from "react";

export function useFeatureFlag(flagName: string): boolean {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFlag = async () => {
      try {
        // Check URL override first
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const override = params.get(`ff_${flagName}`);
          if (override === "true") {
            setEnabled(true);
            setLoading(false);
            return;
          }
          if (override === "false") {
            setEnabled(false);
            setLoading(false);
            return;
          }
        }

        // Check with backend
        const res = await fetch(`/api/feature-flags/check/${flagName}`, {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setEnabled(data.enabled);
        } else {
          setEnabled(false);
        }
      } catch (error) {
        console.error("Feature flag check failed:", error);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    checkFlag();
  }, [flagName]);

  return enabled;
}
