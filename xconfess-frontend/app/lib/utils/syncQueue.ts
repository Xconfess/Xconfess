const DB_NAME = 'xconfess-sync';
const STORE = 'pending-writes';
const SYNC_TAG = 'xconfess-sync-writes';

interface PendingWrite {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
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
