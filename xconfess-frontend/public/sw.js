/* xConfess service worker — offline shell + write queue */

const SHELL_CACHE = 'xconfess-shell-v1';
const API_CACHE = 'xconfess-api-v1';
const SYNC_DB_NAME = 'xconfess-sync';
const SYNC_STORE = 'pending-writes';

const SHELL_URLS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API calls; cache successful responses
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
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

  // Cache-first for everything else (shell, static assets)
  event.respondWith(
    caches
      .match(request)
      .then((cached) => cached ?? fetch(request)),
  );
});

// ── Background sync ───────────────────────────────────────────────────────────

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
      // Will retry on next sync event
    }
  }
}
