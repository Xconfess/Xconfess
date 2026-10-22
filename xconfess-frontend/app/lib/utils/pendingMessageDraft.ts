export const PENDING_MESSAGE_DRAFT_KEY = "xconfess-pending-message-draft";

export interface PendingMessageDraft {
  anonymousUserId: string;
  confessionId: string;
  senderId: string;
  content: string;
}

export interface PendingMessageThread {
  confessionId: string;
  senderId: string;
}

function isPendingMessageDraft(value: unknown): value is PendingMessageDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.anonymousUserId === "string" &&
    typeof candidate.confessionId === "string" &&
    typeof candidate.senderId === "string" &&
    typeof candidate.content === "string"
  );
}

export function savePendingMessageDraft(
  storage: Storage,
  draft: PendingMessageDraft,
): void {
  storage.setItem(PENDING_MESSAGE_DRAFT_KEY, JSON.stringify(draft));
}

export function takePendingMessageDraft(
  storage: Storage,
  anonymousUserId: string,
  thread: PendingMessageThread,
): string | null {
  const serialized = storage.getItem(PENDING_MESSAGE_DRAFT_KEY);
  if (!serialized) return null;

  let draft: unknown;
  try {
    draft = JSON.parse(serialized);
  } catch {
    storage.removeItem(PENDING_MESSAGE_DRAFT_KEY);
    return null;
  }

  if (!isPendingMessageDraft(draft)) {
    storage.removeItem(PENDING_MESSAGE_DRAFT_KEY);
    return null;
  }

  if (draft.anonymousUserId !== anonymousUserId) {
    storage.removeItem(PENDING_MESSAGE_DRAFT_KEY);
    return null;
  }

  if (
    draft.confessionId !== thread.confessionId ||
    draft.senderId !== thread.senderId
  ) {
    return null;
  }

  storage.removeItem(PENDING_MESSAGE_DRAFT_KEY);
  return draft.content;
}
