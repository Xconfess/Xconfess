import {
  Draft,
  DraftConflictReason,
  DraftDTO,
  DraftInput,
  DraftUpdate,
} from "@/app/lib/types/draft";

/**
 * REST contract for Drafts with revision/version safety & conflict handling:
 *   GET    /api/confessions/drafts        -> DraftDTO[]
 *   POST   /api/confessions/drafts        -> DraftDTO        body: DraftInput & { version?: number }
 *   PATCH  /api/confessions/drafts/:id    -> DraftDTO        body: DraftUpdate & { version?: number }
 *   DELETE /api/confessions/drafts/:id    -> 204
 */

export interface DraftConflictErrorData {
  message: string;
  /**
   * Machine-readable cause. Absent on older backends — callers should
   * default to "remote_updated" when a 409 carries no reason.
   */
  reason?: DraftConflictReason;
  /** Present for "remote_updated"; absent when the remote draft was deleted. */
  currentDraft?: DraftDTO;
  currentVersion?: number;
  draftId?: string;
}

export class DraftApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: DraftConflictErrorData,
  ) {
    super(message);
    this.name = "DraftApiError";
  }
}

export function toDraft(dto: DraftDTO): Draft {
  const body = dto.content ?? "";
  const savedAt = dto.updatedAt ?? dto.savedAt ?? dto.createdAt ?? new Date().toISOString();
  return {
    id: dto.id,
    body,
    gender: dto.category as Draft["gender"],
    savedAt: new Date(savedAt).getTime(),
    characterCount: dto.characterCount ?? body.length,
    scheduledFor: dto.scheduledFor,
    timezone: dto.timezone,
    version: dto.version ?? 1,
  };
}

function toApiBody(draft: DraftInput | DraftUpdate) {
  return {
    content: draft.body,
    category: draft.gender,
    scheduledFor: "scheduledFor" in draft ? draft.scheduledFor : undefined,
    timezone: "timezone" in draft ? draft.timezone : undefined,
    version: "version" in draft ? draft.version : undefined,
  };
}

async function parseJsonOrThrow(res: Response) {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let errorData: any = undefined;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      if (res.status === 409) {
        errorData = body;
      }
    } catch {
      // response wasn't JSON; fall back to status-based message
    }
    throw new DraftApiError(message, res.status, errorData);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchDrafts(token: string): Promise<Draft[]> {
  const res = await fetch("/api/confessions/drafts", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await parseJsonOrThrow(res)) as DraftDTO[];
  return data.map(toDraft);
}

export async function createDraft(
  token: string,
  draft: DraftInput & { version?: number },
): Promise<Draft> {
  const res = await fetch("/api/confessions/drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(toApiBody(draft)),
  });
  const data = (await parseJsonOrThrow(res)) as DraftDTO;
  return toDraft(data);
}

export async function patchDraft(
  token: string,
  id: string,
  updates: DraftUpdate & { version?: number },
): Promise<Draft> {
  const res = await fetch(`/api/confessions/drafts/${id}/autosave`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(toApiBody(updates)),
  });
  const data = (await parseJsonOrThrow(res)) as DraftDTO;
  return toDraft(data);
}

export async function deleteDraftRemote(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(`/api/confessions/drafts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseJsonOrThrow(res);
}

export async function clearDraftsRemote(token: string): Promise<void> {
  const res = await fetch("/api/confessions/drafts", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseJsonOrThrow(res);
}