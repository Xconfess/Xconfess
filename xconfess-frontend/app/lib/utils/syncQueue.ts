const DB_NAME = 'xconfess-sync';
const DB_VERSION = 2;
const STORE = 'pending-writes';
const CONFLICT_STORE = 'sync-conflicts';
const SYNC_TAG = 'xconfess-sync-writes';

interface PendingWrite {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/**
 * A queued write the service worker replayed and the server rejected with
 * 409 (the remote draft moved on or was deleted while offline). Kept so the
 * UI can surface it even if the client wasn't running when the replay
 * happened; the corresponding pending write is removed so it is not
 * retried forever.
 */
export interface SyncConflict {
  id?: number;
  draftId: string;
  reason: 'remote_updated' | 'remote_deleted';
  baseVersion?: number;
  localBody?: string;
  remote?: unknown;
  detectedAt: number;
}

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
    db.createObjectStore(CONFLICT_STORE, { keyPath: 'id', autoIncrement: true });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueWrite(write: Omit<PendingWrite, 'id'>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(write);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(SYNC_TAG);
  }
}

/** Conflicts recorded by the service worker during offline-queue replay. */
export async function readSyncConflicts(): Promise<SyncConflict[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, 'readonly');
    const req = tx.objectStore(CONFLICT_STORE).getAll();
    req.onsuccess = () => resolve(req.result as SyncConflict[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSyncConflict(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, 'readwrite');
    const req = tx.objectStore(CONFLICT_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
