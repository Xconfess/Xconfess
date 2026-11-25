export const SESSION_EXPIRED_EVENT = "xconfess:session-expired";

let expiryLatched = false;
let cleanupPromise: Promise<void> | null = null;

/**
 * Collapse concurrent 401 responses into one local logout, one server cleanup,
 * and one notification to the authentication provider.
 */
export function coordinateSessionExpiry(clearLocalSession: () => void): Promise<void> {
  if (cleanupPromise) return cleanupPromise;
  if (expiryLatched) return Promise.resolve();

  expiryLatched = true;
  clearLocalSession();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  cleanupPromise = fetch("/api/auth/session", { method: "DELETE" })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      cleanupPromise = null;
    });

  return cleanupPromise;
}

/** Allow a newly authenticated session to expire independently. */
export function resetSessionExpiryCoordinator(): void {
  expiryLatched = false;
  cleanupPromise = null;
}
