/* xConfess service worker - offline shell + write queue */

const SHELL_CACHE = 'xconfess-shell-v3';
const API_CACHE = 'xconfess-api-v3';
const SYNC_DB_NAME = 'xconfess-sync';
const SYNC_STORE = 'pending-writes';

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
    const req = indexedDB.open(SYNC_DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function replaySyncQueue() {
  const db = await openSyncDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE, 'readonly');
    const req = tx.objectStore(SYNC_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        const req = tx.objectStore(SYNC_STORE).delete(item.id);
        req.onsuccess = resolve;
        req.onerror = reject;
      });
    } catch {
      // Will retry on the next sync event.
    }
  }
}
