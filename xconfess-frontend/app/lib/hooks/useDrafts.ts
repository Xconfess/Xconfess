"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { Draft, DraftInput, DraftUpdate } from "@/app/lib/types/draft";
import {
  fetchDrafts,
  createDraft,
  patchDraft,
  deleteDraftRemote,
  clearDraftsRemote,
  DraftApiError,
} from "@/app/lib/api/drafts";

const STORAGE_KEY = "xconfess-drafts";
const MAX_DRAFTS = 10;

// Issue #678: Global flag to suppress repeated console noise in local dev/private browsing
let hasWarnedStorageError = false;

function readLocalDrafts(): Draft[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Draft[]) : [];
  } catch {
    return [];
  }
}

/**
 * Draft persistence with two backends:
 *  - Guest (not authenticated): localStorage, same behavior as before
 *    this change, including cross-tab sync via the `storage` event.
 *  - Authenticated: REST API (app/lib/api/drafts.ts), so drafts persist
 *    server-side and survive a cleared browser / device switch.
 *
 * ASSUMPTION: useAuth() exposes { user, token, isAuthenticated }. If the
 * real AuthContextValue shape differs, update the destructuring below —
 * this is the only place that needs to change.
 */
export function useDrafts() {
  const { token, isAuthenticated } = useAuth() as unknown as {
    token: string | null;
    isAuthenticated: boolean;
  };

  const [drafts, setDrafts] = useState<Draft[]>(() => readLocalDrafts());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid stale closures in the async fetch-on-mount effect.
  const draftsRef = useRef<Draft[]>(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // ---- Guest mode: cross-tab sync (unchanged from prior behavior) ----
  useEffect(() => {
    if (isAuthenticated) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setDrafts(JSON.parse(e.newValue) as Draft[]);
        } catch {
          // Suppress sync error noise
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [isAuthenticated]);

  // ---- Authenticated mode: load drafts from the server on mount / login ----
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchDrafts(token)
      .then((remoteDrafts) => {
        if (!cancelled) setDrafts(remoteDrafts);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof DraftApiError
              ? err.message
              : "Could not load drafts.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  const persistLocal = useCallback((newDrafts: Draft[]) => {
    const sorted = [...newDrafts]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_DRAFTS);

    setDrafts(sorted);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
      return true;
    } catch {
      if (!hasWarnedStorageError) {
        console.warn(
          "Xconfess: Draft persistence unavailable (localStorage). Drafts will not be saved across refreshes.",
        );
        hasWarnedStorageError = true;
      }
      return false;
    }
  }, []);

  /**
   * Both save and update are async-only. They used to be synchronous when
   * localStorage was the only backend; now that authenticated users hit a
   * real network request, a sync signature would either lie about success
   * (return before the request resolves) or silently no-op when
   * authenticated. Callers must `await` or `void` these.
   */
  const saveDraft = useCallback(
    async (draft: DraftInput): Promise<string | null> => {
      if (isAuthenticated && token) {
        try {
          const created = await createDraft(token, draft);
          setDrafts((prev) =>
            [created, ...prev.filter((d) => d.id !== created.id)]
              .sort((a, b) => b.savedAt - a.savedAt)
              .slice(0, MAX_DRAFTS),
          );
          setError(null);
          return created.id;
        } catch (err) {
          setError(
            err instanceof DraftApiError
              ? err.message
              : "Failed to save draft.",
          );
          return null;
        }
      }

      const newDraft: Draft = {
        ...draft,
        id: crypto.randomUUID(),
        savedAt: Date.now(),
        characterCount: (draft.title?.length || 0) + draft.body.length,
      };
      const updated = [
        newDraft,
        ...draftsRef.current.filter((d) => d.id !== newDraft.id),
      ];
      const success = persistLocal(updated);
      return success ? newDraft.id : null;
    },
    [isAuthenticated, token, persistLocal],
  );

  const updateDraft = useCallback(
    async (id: string, updates: DraftUpdate): Promise<boolean> => {
      if (isAuthenticated && token) {
        try {
          const updatedDraft = await patchDraft(token, id, updates);
          setDrafts((prev) =>
            prev.map((d) => (d.id === id ? updatedDraft : d)),
          );
          setError(null);
          return true;
        } catch (err) {
          setError(
            err instanceof DraftApiError
              ? err.message
              : "Failed to save draft.",
          );
          return false;
        }
      }

      const updated = draftsRef.current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              ...updates,
              savedAt: Date.now(),
              characterCount:
                (updates.title?.length ?? draft.title?.length ?? 0) +
                (updates.body?.length ?? draft.body.length),
            }
          : draft,
      );
      return persistLocal(updated);
    },
    [isAuthenticated, token, persistLocal],
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      if (isAuthenticated && token) {
        try {
          await deleteDraftRemote(token, id);
          setDrafts((prev) => prev.filter((d) => d.id !== id));
        } catch (err) {
          setError(
            err instanceof DraftApiError
              ? err.message
              : "Failed to delete draft.",
          );
        }
        return;
      }
      const updated = draftsRef.current.filter((d) => d.id !== id);
      persistLocal(updated);
    },
    [isAuthenticated, token, persistLocal],
  );

  const clearDrafts = useCallback(async () => {
    if (isAuthenticated && token) {
      try {
        await clearDraftsRemote(token);
        setDrafts([]);
      } catch (err) {
        setError(
          err instanceof DraftApiError
            ? err.message
            : "Failed to clear drafts.",
        );
      }
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Silent fail, matches prior behavior
    }
    setDrafts([]);
  }, [isAuthenticated, token]);

  const loadDraft = useCallback(
    (id: string): Draft | undefined => draftsRef.current.find((d) => d.id === id),
    [],
  );

  return {
    drafts,
    isLoading,
    error,
    isRemote: isAuthenticated,
    saveDraft,
    updateDraft,
    deleteDraft,
    clearDrafts,
    loadDraft,
  };
}
