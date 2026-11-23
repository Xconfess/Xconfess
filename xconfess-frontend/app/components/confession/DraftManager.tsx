"use client";

import { useState, useEffect, useRef } from "react";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import { Draft } from "@/app/lib/types/draft";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { ConfirmDialog } from "@/app/components/admin/ConfirmDialog";
import { useGlobalToast } from "@/app/components/common/Toast";
import { Trash2, Clock, FileText } from "lucide-react";
import { formatDate } from "@/app/lib/utils/formatDate";
import { Gender } from "@/app/lib/utils/validation";

interface DraftManagerProps {
  currentDraft: {
    title?: string;
    body: string;
    gender?: string;
  };
  onLoadDraft: (draft: Draft) => void;
  autoSaveInterval?: number;
}

export const DraftManager: React.FC<DraftManagerProps> = ({
  currentDraft,
  onLoadDraft,
  autoSaveInterval = 3000,
}) => {
  const {
    drafts,
    isLoading,
    error: draftsError,
    isRemote,
    conflicts,
    resolveConflict,
    saveDraft,
    updateDraft,
    deleteDraft,
    clearDrafts,
    loadDraft,
  } = useDrafts();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [clearDraftsOpen, setClearDraftsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "failed" | "conflict"
  >("saved");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");
  const toast = useGlobalToast();

  const activeConflict =
    conflicts.find((c) => c.draftId === currentDraftId) ?? null;

  const didAttemptRestoreRef = useRef(false);
  useEffect(() => {
    if (didAttemptRestoreRef.current) return;
    if (isLoading) return;
    didAttemptRestoreRef.current = true;

    if (!currentDraft.body.trim().length && drafts.length > 0) {
      const mostRecent = drafts[0];
      onLoadDraft(mostRecent);
      setCurrentDraftId(mostRecent.id);
      lastSavedRef.current = JSON.stringify({
        title: mostRecent.title,
        body: mostRecent.body,
        gender: mostRecent.gender,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, drafts]);

  useEffect(() => {
    if (currentDraftId && !loadDraft(currentDraftId)) {
      setCurrentDraftId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // Surface a detected conflict on the inline status line.
  useEffect(() => {
    if (activeConflict) {
      setSaveStatus("conflict");
      setSaveMessage(null);
    } else if (saveStatus === "conflict") {
      setSaveStatus("saved");
      setSaveMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConflict]);

  const persistDraft = async () => {
    // An unresolved offline-sync conflict is holding this draft. Stop
    // auto-saving so we never re-send (and never blindly overwrite the
    // newer remote copy) until the user resolves it.
    if (currentDraftId && conflicts.some((c) => c.draftId === currentDraftId)) {
      return false;
    }

    const currentContent = JSON.stringify(currentDraft);
    if (currentContent === lastSavedRef.current) {
      return true;
    }

    if (!currentDraft.body.trim().length) {
      setSaveStatus("saved");
      setSaveMessage(null);
      lastSavedRef.current = currentContent;
      return true;
    }

    const draftToSave = {
      title: currentDraft.title,
      body: currentDraft.body,
      gender: currentDraft.gender as Gender | undefined,
    };

    setSaveStatus("saving");
    setSaveMessage("Saving draft...");

    const existingDraft = currentDraftId ? loadDraft(currentDraftId) : null;
    let success = false;

    try {
      if (existingDraft && currentDraftId) {
        success = await updateDraft(currentDraftId, draftToSave);
      } else {
        if (currentDraftId) {
          setCurrentDraftId(null);
        }
        const newDraftId = await saveDraft(draftToSave);
        if (newDraftId) {
          setCurrentDraftId(newDraftId);
          success = true;
        }
      }
    } catch {
      success = false;
    }

    if (success) {
      setSaveStatus("saved");
      setSaveMessage("Draft saved.");
      lastSavedRef.current = currentContent;
      return true;
    }

    setSaveStatus("failed");
    setSaveMessage(
      draftsError ??
      (isRemote
        ? "Failed to save draft. Check your connection and retry."
        : "Failed to save draft."),
    );
    return false;
  };

  useEffect(() => {
    const currentContent = JSON.stringify(currentDraft);

    if (currentContent !== lastSavedRef.current) {
      setSaveStatus("unsaved");
      setSaveMessage("Unsaved changes");
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void persistDraft();
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDraft, autoSaveInterval, currentDraftId]);

  const handleLoadDraft = (draft: Draft) => {
    onLoadDraft(draft);
    setCurrentDraftId(draft.id);
    lastSavedRef.current = JSON.stringify({
      title: draft.title,
      body: draft.body,
      gender: draft.gender,
    });
    setSaveStatus("saved");
    setSaveMessage("Draft saved.");
    setIsModalOpen(false);
  };

  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void deleteDraft(id);
    if (currentDraftId === id) {
      setCurrentDraftId(null);
    }
  };

  const handleClearDrafts = async () => {
    await clearDrafts();
    setCurrentDraftId(null);
    setClearDraftsOpen(false);
    toast.success("All drafts cleared.");
  };

  const handleResolveConflict = async (
    resolution: "keep-local" | "keep-remote" | "discard-local",
  ) => {
    if (!activeConflict) return;
    const { draftId, reason, remote } = activeConflict;
    const ok = await resolveConflict(draftId, resolution);
    if (!ok) return;

    if (resolution === "keep-remote" && reason === "remote_updated" && remote) {
      onLoadDraft(remote);
      lastSavedRef.current = JSON.stringify({
        title: remote.title,
        body: remote.body,
        gender: remote.gender,
      });
    }

    if (resolution === "keep-remote" && reason === "remote_deleted") {
      setCurrentDraftId(null);
    }

    if (resolution === "keep-local") {
      // The retained local content is now the synced baseline.
      lastSavedRef.current = JSON.stringify(currentDraft);
    }

    setSaveStatus("saved");
    setSaveMessage(resolution === "discard-local" ? null : "Draft saved.");
  };

  return (
    <>
      <ConfirmDialog
        open={clearDraftsOpen}
        onOpenChange={setClearDraftsOpen}
        title="Clear all drafts?"
        description="This will permanently remove every saved draft on this device."
        confirmLabel="Clear drafts"
        variant="danger"
        onConfirm={() => void handleClearDrafts()}
      />

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          aria-label={drafts.length > 0 ? `Manage drafts (${drafts.length} saved)` : "Manage drafts"}
          title={drafts.length > 0 ? `Manage drafts (${drafts.length} saved)` : "Manage drafts"}
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Drafts</span>
          {drafts.length > 0 && (
            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs" aria-hidden="true">
              {drafts.length}
            </span>
          )}
        </Button>

        <div className="text-xs text-zinc-400" aria-live="polite" aria-atomic="true">
          {saveStatus === "saved" && saveMessage && <span>{saveMessage}</span>}
          {saveStatus === "unsaved" && (
            <span className="text-amber-300">Unsaved changes</span>
          )}
          {saveStatus === "saving" && <span>Saving draft…</span>}
          {saveStatus === "failed" && (
            <span className="text-rose-300">
              {saveMessage ?? "Failed to save draft."}{" "}
              <button
                type="button"
                onClick={() => void persistDraft()}
                className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
              >
                Retry
              </button>
            </span>
          )}
          {saveStatus === "conflict" && activeConflict && (
            <span className="text-amber-300">
              {activeConflict.reason === "remote_deleted"
                ? "This draft was deleted remotely while you were offline."
                : "This draft was changed elsewhere while you were offline."}
            </span>
          )}
        </div>

        {activeConflict && (
          <div
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100"
          >
            <p className="font-medium">
              {activeConflict.reason === "remote_deleted"
                ? "This draft was deleted remotely while you were offline."
                : "This draft was changed elsewhere while you were offline."}
            </p>
            <p className="mt-1 text-amber-200/80">
              Your local version is kept in the editor. Choose how to resolve:
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleResolveConflict("keep-local")}
                className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
              >
                {activeConflict.reason === "remote_deleted"
                  ? "Save mine as a new draft"
                  : "Keep my version"}
              </button>
              {activeConflict.reason === "remote_updated" && (
                <button
                  type="button"
                  onClick={() => void handleResolveConflict("keep-remote")}
                  className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
                >
                  Use the newer version
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleResolveConflict("discard-local")}
                className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Saved Drafts"
      >
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-center text-zinc-400 py-8" role="status">
              Loading your drafts…
            </p>
          ) : drafts.length === 0 ? (
            <p className="text-center text-zinc-400 py-8" role="status">
              No saved drafts yet. Your drafts will be auto-saved every few
              seconds.
            </p>
          ) : (
            <>
              <div
                className="space-y-2 max-h-96 overflow-y-auto"
                role="region"
                aria-label="List of saved drafts"
              >
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => handleLoadDraft(draft)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Load draft: ${draft.title || draft.body.slice(0, 40)}... saved on ${formatDate(new Date(draft.savedAt))}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleLoadDraft(draft);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      {draft.title && (
                        <h4 className="font-medium text-white mb-1 truncate">
                          {draft.title}
                        </h4>
                      )}
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-2">
                        {draft.body}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatDate(new Date(draft.savedAt))}
                        </span>
                        <span>{draft.characterCount} characters</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteDraft(draft.id, e)}
                      aria-label={`Delete draft from ${formatDate(new Date(draft.savedAt))}`}
                      title={`Delete draft from ${formatDate(new Date(draft.savedAt))}`}
                      className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setClearDraftsOpen(true)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Clear All Drafts
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
