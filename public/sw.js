const VERSION = 'v4';
const CACHE_NAME = `bb-shell-${VERSION}`;
const ASSET_CACHE = `bb-assets-${VERSION}`;
const API_CACHE = `bb-api-${VERSION}`;
const OFFLINE_URL = '/';

// IndexedDB keys
const DB_NAME = 'bb-offline';
const OUTBOX_STORE = 'outbox';

// List of core assets to pre-cache (can be extended)
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
      self.skipWaiting(),
      // Enable navigation preload (faster navigations when SW is controlling)
      ('navigationPreload' in self.registration)
        ? self.registration.navigationPreload.enable()
        : Promise.resolve()
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (![CACHE_NAME, ASSET_CACHE, API_CACHE].includes(key)) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Minimal IndexedDB helpers in SW scope ---
const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const outboxAdd = async (record) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(OUTBOX_STORE).add(record);
  });
};

const outboxAll = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
};

const outboxDelete = async (id) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(OUTBOX_STORE).delete(id);
  });
};

// Utility: fetch with timeout
const fetchWithTimeout = (request, { timeoutMs = 8000 } = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(id));
};

// Strategy:
// - HTML (navigation): network-first, fallback to cached shell
// - Static assets (same-origin): cache-first, populate ASSET_CACHE
// - API GET (supabase/rest): network-first with timeout, fallback to cache (kept fresh)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Handle Supabase REST non-GET: queue offline mutations
  const isSupabaseRest = /supabase\.co\/rest\//.test(url.href) || url.pathname.includes('/rest/v1/');
  if (isSupabaseRest && req.method !== 'GET') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req.clone());
        return res;
      } catch (e) {
        // Offline or network error: queue and register sync
        try {
          const body = await req.clone().text();
          const headers = {};
          req.headers.forEach((v, k) => { headers[k] = v; });
          await outboxAdd({
            createdAt: Date.now(),
            url: req.url,
            method: req.method,
            body,
            headers,
          });
          if ('sync' in self.registration) {
            try { await self.registration.sync.register('sync-api'); } catch {}
          }
          // Return an accepted response so UI can proceed and show queued state
          return new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return Response.error();
        }
      }
    })());
    return;
  }

  // Navigation requests (documents)
  if (req.method === 'GET' && (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html'))) {
    event.respondWith(
      (async () => {
        try {
          // Prefer navigation preload if available
          const preload = await event.preloadResponse;
          if (preload) {
            const resClone = preload.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_URL, resClone));
            return preload;
          }
          const net = await fetchWithTimeout(req, { timeoutMs: 8000 });
          const resClone = net.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_URL, resClone));
          return net;
        } catch (e) {
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  // Supabase REST API caching (GET only)
  if (isSupabaseRest && req.method === 'GET') {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        try {
          const net = await fetchWithTimeout(req, { timeoutMs: 7000 });
          if (net && net.ok) cache.put(req, net.clone());
          return net;
        } catch (e) {
          // Fallback to cache if offline/timeout
          if (cached) return cached;
          // As last resort, error
          return Response.error();
        }
      })
    );
    return;
  }

  // Asset requests: cache-first for same-origin
  if (req.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(req, resClone));
          return res;
        });
      })
    );
  }
});

// Background Sync: flush queued API mutations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-api') {
    event.waitUntil((async () => {
      const items = await outboxAll();
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body,
          });
          if (res && res.ok) {
            await outboxDelete(item.id);
          }
        } catch {}
      }
    })());
  }
});
