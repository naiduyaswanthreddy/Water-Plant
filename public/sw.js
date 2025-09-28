const VERSION = 'v3';
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

  // Only handle GET
  if (req.method !== 'GET') return;

  // Navigation requests (documents)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
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
  const isSupabaseRest = /supabase\.co\/rest\//.test(url.href) || url.pathname.includes('/rest/v1/');
  if (isSupabaseRest) {
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
