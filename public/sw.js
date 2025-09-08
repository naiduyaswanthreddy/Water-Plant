const VERSION = 'v2';
const CACHE_NAME = `bb-shell-${VERSION}`;
const ASSET_CACHE = `bb-assets-${VERSION}`;
const API_CACHE = `bb-api-${VERSION}`;
const OFFLINE_URL = '/';

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
      self.skipWaiting()
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

// Strategy:
// - HTML (navigation): network-first, fallback to cached shell
// - Static assets (same-origin): cache-first, populate ASSET_CACHE
// - API GET (supabase/rest): stale-while-revalidate into API_CACHE
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Navigation requests (documents)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_URL, resClone));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Supabase REST API caching (GET only)
  const isSupabaseRest = /supabase\.co\/rest\//.test(url.href) || url.pathname.includes('/rest/v1/');
  if (isSupabaseRest) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || Response.error());
        // Stale-while-revalidate
        return cached || networkFetch;
      })
    );
    return;
  }

  // Asset requests: cache-first for same-origin
  if (url.origin === self.location.origin) {
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
