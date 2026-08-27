import type { MessageKeyPair } from './messageE2E';

const DB_NAME = 'xconfess-message-keys';
const STORE_NAME = 'keys';
const DB_VERSION = 1;

interface StoredKeyRecord {
  anonymousUserId: string;
  publicKey: string;
  privateKey: string;
  keyVersion: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'anonymousUserId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalKeyPair(
  anonymousUserId: string,
): Promise<StoredKeyRecord | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(anonymousUserId);

    request.onsuccess = () => {
      resolve((request.result as StoredKeyRecord | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveLocalKeyPair(
  anonymousUserId: string,
  keyPair: MessageKeyPair,
  keyVersion: number,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Secure key storage is unavailable in this environment');
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      anonymousUserId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyVersion,
    } satisfies StoredKeyRecord);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalKeyPair(anonymousUserId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(anonymousUserId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
