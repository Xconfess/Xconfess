"use client";

import { useCallback, useState } from "react";
import type { DraftConflict } from "@/app/lib/types/draft";

type ConflictResolution = "keep-local" | "keep-remote" | "review";

interface ConflictResolutionResult {
  draftId: string;
  resolution: ConflictResolution;
  timestamp: number;
}

export function useDraftConflictResolver() {
  const [activeConflict, setActiveConflict] = useState<DraftConflict | null>(
    null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [resolutions, setResolutions] = useState<ConflictResolutionResult[]>(
    []
  );

  const showConflict = useCallback((conflict: DraftConflict) => {
    setActiveConflict(conflict);
    setIsOpen(true);
  }, []);

  const resolveConflict = useCallback(
    async (resolution: ConflictResolution): Promise<void> => {
      if (!activeConflict) return;

      setResolutions((prev) => [
        ...prev,
        {
          draftId: activeConflict.draftId,
          resolution,
          timestamp: Date.now(),
        },
      ]);

      setIsOpen(false);
      setActiveConflict(null);
    },
    [activeConflict]
  );

  const cancelConflict = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    activeConflict,
    isOpen,
    showConflict,
    resolveConflict,
    cancelConflict,
    resolutions,
  };
}

export function preservePrivateDraftContent(
  local: { body?: string; title?: string; gender?: string }
): { body: string; title?: string; gender?: string } {
  return {
    body: local.body ?? "",
    title: local.title,
    gender: local.gender,
  };
}
