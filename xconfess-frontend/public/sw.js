/* xConfess service worker - offline shell + write queue */

const SHELL_CACHE = 'xconfess-shell-v3';
const API_CACHE = 'xconfess-api-v3';
const SYNC_DB_NAME = 'xconfess-sync';
const SYNC_DB_VERSION = 2;
const SYNC_STORE = 'pending-writes';
const CONFLICT_STORE = 'sync-conflicts';

const SHELL_URLS = ['/', '/offline', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          SHELL_URLS.map((url) =>
            fetch(url)
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => Response.error()),
    );
    return;
  }

  if (
    request.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(API_CACHE).then((cache) => cache.put(request, clone)),
            );
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(JSON.stringify({ offline: true }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
          ),
        ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match('/offline')
          .then((cached) => cached ?? caches.match('/')),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'xconfess-sync-writes') {
    event.waitUntil(replaySyncQueue());
  }
});

async function openSyncDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        db.createObjectStore(CONFLICT_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(store, run) {
  return new Promise((resolve, reject) => {
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function extractDraftId(url) {
  const match = /\/confessions\/drafts\/([^/?]+)/.exec(url || '');
  return match ? decodeURIComponent(match[1]) : undefined;
}

function parseBody(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function replaySyncQueue() {
  const db = await openSyncDb();
  const items = await idbRequest(db.transaction(SYNC_STORE, 'readonly').objectStore(SYNC_STORE), (s) => s.getAll());

  for (const item of items) {
    let response;
    try {
      response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
    } catch {
      // Offline / network error - leave queued, retry on the next sync event.
      continue;
    }

    if (response.status === 409) {
      // The remote draft moved on (edited elsewhere or deleted) while this
      // write was queued offline. Record the conflict, tell any open client,
      // and drop the write so it is not replayed forever - the local copy
      // is never silently overwritten and never silently lost.
      let payload = null;
      try {
        payload = await response.clone().json();
      } catch {
        payload = null;
      }

      const sent = parseBody(item.body);
      const draftId =
        (payload && payload.draftId) || extractDraftId(item.url) || 'unknown';
      const reason =
        payload && payload.reason === 'remote_deleted'
          ? 'remote_deleted'
          : 'remote_updated';

      const conflict = {
        draftId,
        reason,
        baseVersion: sent.version,
        localBody: sent.content,
        remote: payload && payload.currentDraft ? payload.currentDraft : undefined,
        detectedAt: Date.now(),
      };

      await idbRequest(
        db.transaction(CONFLICT_STORE, 'readwrite').objectStore(CONFLICT_STORE),
        (s) => s.add(conflict),
      );
      await idbRequest(
        db.transaction(SYNC_STORE, 'readwrite').objectStore(SYNC_STORE),
        (s) => s.delete(item.id),
      );
      await notifyClients({ type: 'draft-sync-conflict', ...conflict });
      continue;
    }

    if (response.ok) {
      await idbRequest(
        db.transaction(SYNC_STORE, 'readwrite').objectStore(SYNC_STORE),
        (s) => s.delete(item.id),
      );
      continue;
    }

    // Other failures (auth, 5xx, ...) - leave queued for a later retry.
  }
}
