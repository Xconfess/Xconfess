"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/lib/hooks/useAuth";
import {
  Draft,
  DraftConflict,
  DraftConflictReason,
  DraftInput,
  DraftUpdate,
} from "@/app/lib/types/draft";
export type { Draft } from "@/app/lib/types/draft";
import {
  fetchDrafts,
  createDraft,
  patchDraft,
  deleteDraftRemote,
  clearDraftsRemote,
  toDraft,
  DraftApiError,
  type DraftConflictErrorData,
} from "@/app/lib/api/drafts";
import { enqueueWrite } from "@/app/lib/utils/syncQueue";

export type ConflictResolution = "keep-local" | "keep-remote" | "discard-local";

const REMOTE_UPDATED_MSG =
  "This draft was changed elsewhere while you were offline. Your local copy is kept.";
const REMOTE_DELETED_MSG =
  "This draft was deleted remotely while you were offline. Your local copy is kept.";

function conflictMessage(reason: DraftConflictReason): string {
  return reason === "remote_deleted" ? REMOTE_DELETED_MSG : REMOTE_UPDATED_MSG;
}

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

  /**
   * Unresolved offline-sync conflicts, keyed by draft id. A conflict never
   * mutates `drafts` — the local copy stays exactly as the user left it —
   * and is never retried automatically. It clears only via `resolveConflict`
   * or a subsequent successful write to the same id.
   */
  const [conflicts, setConflicts] = useState<DraftConflict[]>([]);

  // Avoid stale closures in the async fetch-on-mount effect.
  const draftsRef = useRef<Draft[]>(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const conflictsRef = useRef<DraftConflict[]>(conflicts);
  useEffect(() => {
    conflictsRef.current = conflicts;
  }, [conflicts]);

  const clearConflict = useCallback((id: string) => {
    setConflicts((prev) => prev.filter((c) => c.draftId !== id));
  }, []);

  const recordConflict = useCallback(
    (
      id: string,
      local: DraftConflict["local"],
      data: DraftConflictErrorData | undefined,
    ) => {
      const reason: DraftConflictReason =
        data?.reason === "remote_deleted" ? "remote_deleted" : "remote_updated";
      const remote = data?.currentDraft ? toDraft(data.currentDraft) : undefined;

      setConflicts((prev) => [
        ...prev.filter((c) => c.draftId !== id),
        {
          draftId: id,
          reason,
          detectedAt: Date.now(),
          local,
          baseVersion: data?.currentVersion,
          remote,
        },
      ]);
      setError(conflictMessage(reason));
    },
    [],
  );

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

  // ---- Conflicts reported by the service worker while replaying the ----
  // ---- offline write queue (edits made fully offline, synced later). ----
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const onMessage = (event: MessageEvent) => {
      const msg = event.data as
        | {
            type?: string;
            draftId?: string;
            reason?: DraftConflictReason;
            baseVersion?: number;
            localBody?: string;
            remote?: Parameters<typeof toDraft>[0];
          }
        | undefined;
      if (!msg || msg.type !== "draft-sync-conflict" || !msg.draftId) return;

      const reason: DraftConflictReason =
        msg.reason === "remote_deleted" ? "remote_deleted" : "remote_updated";
      const local = draftsRef.current.find((d) => d.id === msg.draftId);

      setConflicts((prev) => [
        ...prev.filter((c) => c.draftId !== msg.draftId),
        {
          draftId: msg.draftId!,
          reason,
          detectedAt: Date.now(),
          local: {
            body: msg.localBody ?? local?.body ?? "",
            title: local?.title,
            gender: local?.gender,
          },
          baseVersion: msg.baseVersion,
          remote: msg.remote ? toDraft(msg.remote) : undefined,
        },
      ]);
      setError(conflictMessage(reason));
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [isAuthenticated]);

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
        const existing = draftsRef.current.find((d) => d.id === id);
        // Carry the last-observed server revision so the backend can reject
        // a stale write (optimistic concurrency) instead of clobbering a
        // newer remote draft.
        const baseVersion = updates.version ?? existing?.version;
        const localSnapshot = {
          body: updates.body ?? existing?.body ?? "",
          title: updates.title ?? existing?.title,
          gender: updates.gender ?? existing?.gender,
        };

        try {
          const updatedDraft = await patchDraft(token, id, {
            ...updates,
            version: baseVersion,
          });
          setDrafts((prev) =>
            prev.map((d) => (d.id === id ? updatedDraft : d)),
          );
          clearConflict(id);
          setError(null);
          return true;
        } catch (err) {
          if (err instanceof DraftApiError && err.status === 409) {
            // Remote copy moved on (edited elsewhere or deleted) while this
            // edit was offline. Preserve the local copy untouched, surface
            // the conflict, and do NOT retry.
            recordConflict(id, localSnapshot, err.data);
            return false;
          }

          if (!(err instanceof DraftApiError)) {
            // Network failure / offline: queue the write for background
            // replay, tagged with the base version so replay still gets
            // deterministic conflict handling.
            void enqueueWrite({
              url: `/api/confessions/drafts/${id}`,
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                content: localSnapshot.body,
                category: localSnapshot.gender,
                version: baseVersion,
              }),
            }).catch(() => {
              /* best effort — nothing more we can do here */
            });
            setError(
              "You're offline. This draft will sync when you reconnect.",
            );
            return false;
          }

          setError(err.message || "Failed to save draft.");
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
    [isAuthenticated, token, persistLocal, clearConflict, recordConflict],
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      if (isAuthenticated && token) {
        try {
          await deleteDraftRemote(token, id);
          setDrafts((prev) => prev.filter((d) => d.id !== id));
          clearConflict(id);
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
    [isAuthenticated, token, persistLocal, clearConflict],
  );

  /**
   * Explicit conflict resolution. Never automatic.
   *  - keep-local:  push the retained local content to the server. For
   *                 "remote_updated" this rebases onto the current remote
   *                 version; for "remote_deleted" it re-creates the draft.
   *  - keep-remote: adopt the server copy (or drop the draft if it was
   *                 deleted remotely), discarding the local edit.
   *  - discard-local: just dismiss the conflict banner, leaving the editor
   *                 contents untouched for the user to copy out manually.
   */
  const resolveConflict = useCallback(
    async (draftId: string, resolution: ConflictResolution): Promise<boolean> => {
      const conflict = conflictsRef.current.find((c) => c.draftId === draftId);
      if (!conflict) return false;

      if (resolution === "discard-local" || !isAuthenticated || !token) {
        clearConflict(draftId);
        if (resolution === "keep-remote" && conflict.reason === "remote_deleted") {
          setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        }
        setError(null);
        return true;
      }

      if (resolution === "keep-remote") {
        setDrafts((prev) => {
          if (conflict.reason === "remote_deleted") {
            return prev.filter((d) => d.id !== draftId);
          }
          return conflict.remote
            ? prev.map((d) => (d.id === draftId ? conflict.remote! : d))
            : prev;
        });
        clearConflict(draftId);
        setError(null);
        return true;
      }

      // keep-local
      try {
        if (conflict.reason === "remote_deleted") {
          const created = await createDraft(token, {
            body: conflict.local.body,
            title: conflict.local.title,
            gender: conflict.local.gender,
          });
          setDrafts((prev) =>
            [created, ...prev.filter((d) => d.id !== draftId && d.id !== created.id)]
              .sort((a, b) => b.savedAt - a.savedAt)
              .slice(0, MAX_DRAFTS),
          );
        } else {
          const updated = await patchDraft(token, draftId, {
            body: conflict.local.body,
            title: conflict.local.title,
            gender: conflict.local.gender,
            version: conflict.remote?.version,
          });
          setDrafts((prev) => prev.map((d) => (d.id === draftId ? updated : d)));
        }
        clearConflict(draftId);
        setError(null);
        return true;
      } catch (err) {
        if (err instanceof DraftApiError && err.status === 409) {
          // Remote moved again between detection and resolution — refresh
          // the conflict with the newer remote state rather than looping.
          recordConflict(draftId, conflict.local, err.data);
          return false;
        }
        setError(
          err instanceof DraftApiError
            ? err.message
            : "Could not resolve the draft conflict.",
        );
        return false;
      }
    },
    [isAuthenticated, token, clearConflict, recordConflict],
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
    conflicts,
    resolveConflict,
    saveDraft,
    updateDraft,
    deleteDraft,
    clearDrafts,
    loadDraft,
  };
}
