import type { ConfessionFormData } from "./validation";

const PENDING_CONFESSION_KEY = "xconfess.pendingConfession.v1";
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingConfession = ConfessionFormData & {
  savedAt: number;
};

function canUseStorage(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function pendingConfessionStorageKey(): string {
  return PENDING_CONFESSION_KEY;
}

export function savePendingConfession(data: ConfessionFormData): void {
  if (!canUseStorage()) return;

  const pending: PendingConfession = {
    ...data,
    savedAt: Date.now(),
  };

  window.localStorage.setItem(PENDING_CONFESSION_KEY, JSON.stringify(pending));
}

export function loadPendingConfession(): PendingConfession | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(PENDING_CONFESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingConfession;
    if (!parsed.body || Date.now() - parsed.savedAt > MAX_PENDING_AGE_MS) {
      clearPendingConfession();
      return null;
    }
    return parsed;
  } catch {
    clearPendingConfession();
    return null;
  }
}

export function clearPendingConfession(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PENDING_CONFESSION_KEY);
}

export function buildAuthRedirectUrl(authPath: "/login" | "/register"): string {
  return `${authPath}?next=${encodeURIComponent("/#composer")}`;
}
