const CACHE_NAME = 'socialera-mobile-v2';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/config.js'
];
const HOSTNAME = String(self.location.hostname || '').trim().toLowerCase();
const IS_LOCALHOST = ['localhost', '127.0.0.1', '::1'].includes(HOSTNAME);
const IS_PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(HOSTNAME);
const IS_LOCAL_DEVELOPMENT = IS_LOCALHOST || IS_PRIVATE_IPV4 || HOSTNAME.endsWith('.local');

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('activate', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil((async () => {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
      await self.clients.claim();
      await self.registration.unregister().catch(() => false);
    })());
    return;
  }

  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
