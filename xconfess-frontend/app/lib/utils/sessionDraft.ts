import type { Gender } from "./validation";

/**
 * Preserves an in-progress confession across accidental navigation
 * (back/forward, refresh, closed tab reopened via history) within the same
 * browser session.
 *
 * Uses `sessionStorage` deliberately, not `localStorage`:
 * - It's cleared automatically when the tab/session ends, so a draft never
 *   lingers indefinitely on the device.
 * - `sessionStorage` is per-tab, so two tabs composing different confessions
 *   never clobber each other's draft (unlike a shared `localStorage` key).
 */

const SESSION_DRAFT_KEY = "xconfess.sessionDraft.v1";

/**
 * A tab can stay open for days; a draft older than this is dropped on load so
 * it is never restored indefinitely.
 */
export const SESSION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionDraft {
  title: string;
  body: string;
  gender?: Gender;
  savedAt: number;
}

function canUseSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.sessionStorage);
  } catch {
    return false;
  }
}

export function saveSessionDraft(draft: Omit<SessionDraft, "savedAt">): void {
  if (!canUseSessionStorage()) return;

  // Don't persist an effectively-empty draft.
  if (!draft.title?.trim() && !draft.body?.trim()) {
    clearSessionDraft();
    return;
  }

  const payload: SessionDraft = { ...draft, savedAt: Date.now() };
  try {
    window.sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — draft
    // preservation is a convenience, not a hard requirement.
  }
}

export function loadSessionDraft(): SessionDraft | null {
  if (!canUseSessionStorage()) return null;

  const raw = window.sessionStorage.getItem(SESSION_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionDraft;
    if (!parsed.body?.trim() && !parsed.title?.trim()) {
      clearSessionDraft();
      return null;
    }
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > SESSION_DRAFT_TTL_MS
    ) {
      clearSessionDraft();
      return null;
    }
    return parsed;
  } catch {
    clearSessionDraft();
    return null;
  }
}

export function clearSessionDraft(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(SESSION_DRAFT_KEY);
  } catch {
    // No-op — nothing to clean up if storage is unavailable.
  }
}
