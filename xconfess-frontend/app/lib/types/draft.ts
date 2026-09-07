import { Gender } from "@/app/lib/utils/validation";

/**
 * Canonical Draft shape shared by local (localStorage) and remote (API)
 * draft storage. `id` is a client-generated UUID for local drafts, or the
 * server-assigned id once a draft has been synced to the backend.
 */
export interface Draft {
  id: string;
  title?: string;
  body: string;
  gender?: Gender;
  savedAt: number; // epoch ms, used for sort + "last saved" display
  characterCount: number;
  scheduledFor?: string;
  timezone?: string;
  version?: number;
}

export type DraftInput = Omit<Draft, "id" | "savedAt" | "characterCount">;
export type DraftUpdate = Partial<Omit<Draft, "id" | "savedAt">>;

/**
 * Wire format returned by the backend. Kept separate from `Draft` in case
 * the API's field names/casing don't match the frontend's local shape
 * (e.g. snake_case, ISO date strings instead of epoch ms).
 *
 * ASSUMPTION: backend does not exist yet (no app/api/confessions/drafts
 * folder in the repo at time of writing). This contract is a best guess
 * based on the ticket's acceptance criteria. Update `toDraft`/`toApiBody`
 * in app/lib/api/drafts.ts if the real backend differs.
 */
export interface DraftDTO {
  id: string;
  content: string;
  category?: string | null;
  createdAt?: string;
  updatedAt?: string;
  savedAt?: string;
  characterCount?: number;
  scheduledFor?: string;
  timezone?: string;
  version?: number;
}

/**
 * Synchronization state of a single draft relative to the server.
 *  - synced:   local copy matches the last known server revision
 *  - pending:  local edit is queued for the server (offline / not yet sent)
 *  - syncing:  a write is in flight
 *  - failed:   a write failed for a transient reason and is retryable
 *  - conflict: the server copy moved on (edited elsewhere or deleted) while
 *              this client held an offline edit; needs explicit resolution
 */
export type DraftSyncState =
  | "synced"
  | "pending"
  | "syncing"
  | "failed"
  | "conflict";

export type DraftConflictReason = "remote_updated" | "remote_deleted";

/**
 * A local draft edit that could not be reconciled with the server because
 * the remote copy changed ("remote_updated") or was deleted
 * ("remote_deleted") while this client was offline. The local content is
 * retained verbatim so the user can recover it — see `resolveConflict` in
 * `useDrafts`.
 */
export interface DraftConflict {
  draftId: string;
  reason: DraftConflictReason;
  detectedAt: number; // epoch ms
  /** The local edit that lost the race — always recoverable from here. */
  local: {
    body: string;
    title?: string;
    gender?: Gender;
  };
  /** Server revision the local edit was based on, when known. */
  baseVersion?: number;
  /** Current server copy. Undefined when `reason === "remote_deleted"`. */
  remote?: Draft;
}
