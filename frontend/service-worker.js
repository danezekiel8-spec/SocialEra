const APP_CACHE = 'socialera-app-v3';
const STATIC_CACHE = 'socialera-static-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/theme.css',
  '/theme.js',
  '/manifest.webmanifest',
  '/assets/socialera-app-icon.svg'
];
const NETWORK_FIRST_PATHS = [
  '/api/',
  '/supabase.js'
];

function shouldUseNetworkFirst(url) {
  return NETWORK_FIRST_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(path));
}

function fetchAndCache(request, cacheName) {
  return fetch(request).then((response) => {
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone));
    }

    return response;
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key === APP_CACHE || key === STATIC_CACHE) {
          return Promise.resolve();
        }

        return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (shouldUseNetworkFirst(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  if (['script', 'style'].includes(request.destination)) {
    event.respondWith(
      fetchAndCache(request, STATIC_CACHE)
        .catch(() => caches.match(request))
    );
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetchAndCache(request, STATIC_CACHE).catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
