/* Tour Booking service worker: precache shell, network-first for API/verify, cache-first otherwise. */
const CACHE = 'tourbooking-v1';
const PRECACHE = ['/', '/tours', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ticket verification: network first, fall back to cache when offline.
  // (Query ?t= stays part of the cache key, so signatures never mix.)
  // Authenticated /api responses are NEVER cached (key ignores Authorization —
  // caching them could serve one user's data to another offline).
  if (url.pathname.startsWith('/verify')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }
  if (url.pathname.startsWith('/api')) return;

  // App shell & static assets: cache first, populate on miss.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return res;
        }),
    ),
  );
});

// Web push: show the notification payload (or a fallback) on push events.
self.addEventListener('push', (event) => {
  let title = 'Tour Booking';
  let body = 'Bạn có thông báo mới.';
  try {
    const data = event.data ? event.data.json() : null;
    if (data) {
      title = data.title || title;
      body = data.body || data.message || body;
    } else if (event.data) {
      body = event.data.text();
    }
  } catch {
    try {
      body = event.data.text();
    } catch {
      /* keep fallback */
    }
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon.svg' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing && 'focus' in existing) return existing.focus();
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
